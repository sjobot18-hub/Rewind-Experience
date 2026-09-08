-- ============================================================================
-- THE REWIND EXPERIENCE — Business Logic Functions & Views
-- ============================================================================
-- These SECURITY DEFINER functions are the ONLY way payments and expenses get
-- written. This guarantees: sequential unique IDs with no race conditions
-- (via row locking), correct balance-before/after snapshots, and a guaranteed
-- audit log entry for every financial mutation. The frontend and API routes
-- never compute IDs or balances themselves — the database is the single
-- source of truth, as required.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Sequential code generator (TRE001, PAY0001, REC0001, EXP0001) scoped to a
-- single event. Uses a per-event/per-prefix counter row with FOR UPDATE
-- locking so two simultaneous requests can never receive the same code.
-- ----------------------------------------------------------------------------

create table public.event_sequences (
  event_id uuid not null references public.events(id),
  sequence_key text not null, -- 'guest' | 'payment' | 'receipt' | 'expense'
  next_value int not null default 1,
  primary key (event_id, sequence_key)
);

alter table public.event_sequences enable row level security;
create policy "sequences are internal only" on public.event_sequences for all using (false);
-- Only SECURITY DEFINER functions (which run as the table owner) can touch this table.

create or replace function public.next_code(p_event_id uuid, p_key text, p_prefix text, p_width int)
returns text language plpgsql security definer as $$
declare
  v_next int;
begin
  insert into public.event_sequences (event_id, sequence_key, next_value)
  values (p_event_id, p_key, 1)
  on conflict (event_id, sequence_key) do nothing;

  update public.event_sequences
    set next_value = next_value + 1
    where event_id = p_event_id and sequence_key = p_key
    returning next_value - 1 into v_next;

  return p_prefix || lpad(v_next::text, p_width, '0');
end;
$$;

-- ----------------------------------------------------------------------------
-- Guest registration — assigns ticket fee from the event's CURRENT price at
-- registration time, and that fee is never touched again by later price
-- changes.
-- ----------------------------------------------------------------------------

create or replace function public.register_guest(
  p_event_id uuid,
  p_full_name text,
  p_phone_number text,
  p_gender guest_gender,
  p_notes text default null
) returns public.guests
language plpgsql security definer as $$
declare
  v_event public.events;
  v_fee numeric(12,2);
  v_code text;
  v_guest public.guests;
begin
  if not public.has_permission('manage_guests') then
    raise exception 'PERMISSION_DENIED: manage_guests required';
  end if;

  select * into v_event from public.events where id = p_event_id and status = 'active';
  if not found then
    raise exception 'EVENT_NOT_FOUND_OR_ARCHIVED';
  end if;

  v_fee := case p_gender when 'male' then v_event.mens_ticket_price else v_event.womens_ticket_price end;
  v_code := public.next_code(p_event_id, 'guest', 'TRE', 3);

  insert into public.guests (event_id, guest_code, full_name, phone_number, gender, ticket_fee, notes, registered_by)
  values (p_event_id, v_code, p_full_name, p_phone_number, p_gender, v_fee, p_notes, auth.uid())
  returning * into v_guest;

  insert into public.audit_logs (event_id, actor_id, actor_email, action, record_type, record_id, new_value)
  values (p_event_id, auth.uid(), (select email from public.admin_profiles where id = auth.uid()),
          'guest_created', 'guest', v_guest.id::text, to_jsonb(v_guest));

  return v_guest;
end;
$$;

-- ----------------------------------------------------------------------------
-- Guest financial totals (never stored — always derived live from payments)
-- ----------------------------------------------------------------------------

create or replace view public.guest_financials
with (security_invoker = true) as
select
  g.id as guest_id,
  g.event_id,
  g.guest_code,
  g.full_name,
  g.phone_number,
  g.gender,
  g.ticket_fee,
  coalesce(sum(p.amount) filter (where not p.is_voided), 0) as total_paid,
  greatest(g.ticket_fee - coalesce(sum(p.amount) filter (where not p.is_voided), 0), 0) as balance,
  case
    when coalesce(sum(p.amount) filter (where not p.is_voided), 0) <= 0 then 'unpaid'
    when coalesce(sum(p.amount) filter (where not p.is_voided), 0) >= g.ticket_fee then 'paid'
    else 'part_payment'
  end::guest_status as status,
  (coalesce(sum(p.amount) filter (where not p.is_voided), 0) > g.ticket_fee) as is_overpaid,
  greatest(coalesce(sum(p.amount) filter (where not p.is_voided), 0) - g.ticket_fee, 0) as overpayment_amount,
  count(p.id) filter (where not p.is_voided) as payment_count,
  g.registered_at
from public.guests g
left join public.payments p on p.guest_id = g.id
group by g.id;

-- ----------------------------------------------------------------------------
-- Event balance (Total Money Received minus Total Expenses), live-calculated
-- ----------------------------------------------------------------------------

create or replace function public.event_balance(p_event_id uuid)
returns numeric language sql stable security definer as $$
  select
    coalesce((select sum(amount) from public.payments where event_id = p_event_id and not is_voided), 0)
    - coalesce((select sum(amount) from public.expenses where event_id = p_event_id and not is_voided), 0);
$$;

-- ----------------------------------------------------------------------------
-- Record a payment atomically: generates payment_code + receipt_number,
-- detects overpayment, and writes the audit log entry — all in one
-- transaction so partial/duplicate writes are impossible.
-- ----------------------------------------------------------------------------

create or replace function public.record_payment(
  p_event_id uuid,
  p_guest_id uuid,
  p_amount numeric,
  p_method payment_method,
  p_paid_at date,
  p_notes text default null
) returns public.payments
language plpgsql security definer as $$
declare
  v_guest public.guests;
  v_paid_so_far numeric;
  v_payment_code text;
  v_receipt_number text;
  v_payment public.payments;
  v_is_over boolean;
begin
  if not public.has_permission('manage_payments') then
    raise exception 'PERMISSION_DENIED: manage_payments required';
  end if;

  if p_amount <= 0 then
    raise exception 'INVALID_AMOUNT: payment amount must be positive';
  end if;

  select * into v_guest from public.guests where id = p_guest_id and event_id = p_event_id for update;
  if not found then
    raise exception 'GUEST_NOT_FOUND';
  end if;

  select coalesce(sum(amount), 0) into v_paid_so_far
    from public.payments where guest_id = p_guest_id and not is_voided;

  v_is_over := (v_paid_so_far + p_amount) > v_guest.ticket_fee;

  v_payment_code := public.next_code(p_event_id, 'payment', 'PAY', 4);
  v_receipt_number := public.next_code(p_event_id, 'receipt', 'REC', 4);

  insert into public.payments (event_id, guest_id, payment_code, receipt_number, amount, payment_method, received_by, paid_at, notes, is_overpayment)
  values (p_event_id, p_guest_id, v_payment_code, v_receipt_number, p_amount, p_method, auth.uid(), p_paid_at, p_notes, v_is_over)
  returning * into v_payment;

  insert into public.audit_logs (event_id, actor_id, actor_email, action, record_type, record_id, new_value)
  values (p_event_id, auth.uid(), (select email from public.admin_profiles where id = auth.uid()),
          'payment_recorded', 'payment', v_payment.id::text, to_jsonb(v_payment));

  return v_payment;
end;
$$;

-- ----------------------------------------------------------------------------
-- Void a payment (never hard-delete financial history). Requires
-- manage_payments; recorded as its own audit entry with previous value.
-- ----------------------------------------------------------------------------

create or replace function public.void_payment(p_payment_id uuid, p_reason text)
returns public.payments language plpgsql security definer as $$
declare
  v_before public.payments;
  v_after public.payments;
begin
  if not public.has_permission('manage_payments') then
    raise exception 'PERMISSION_DENIED';
  end if;

  select * into v_before from public.payments where id = p_payment_id for update;
  if not found then raise exception 'PAYMENT_NOT_FOUND'; end if;

  update public.payments
    set is_voided = true, voided_at = now(), voided_by = auth.uid(), void_reason = p_reason
    where id = p_payment_id
    returning * into v_after;

  insert into public.audit_logs (event_id, actor_id, actor_email, action, record_type, record_id, previous_value, new_value)
  values (v_after.event_id, auth.uid(), (select email from public.admin_profiles where id = auth.uid()),
          'payment_voided', 'payment', v_after.id::text, to_jsonb(v_before), to_jsonb(v_after));

  return v_after;
end;
$$;

-- ----------------------------------------------------------------------------
-- Record an expense atomically, snapshotting balance_before/after from real
-- transaction sums (never from a cached dashboard figure).
-- ----------------------------------------------------------------------------

create or replace function public.record_expense(
  p_event_id uuid,
  p_category text,
  p_description text,
  p_vendor text,
  p_amount numeric,
  p_method payment_method,
  p_spent_at date,
  p_notes text default null
) returns public.expenses
language plpgsql security definer as $$
declare
  v_balance_before numeric;
  v_expense_code text;
  v_expense public.expenses;
begin
  if not public.has_permission('manage_expenses') then
    raise exception 'PERMISSION_DENIED: manage_expenses required';
  end if;

  if p_amount <= 0 then
    raise exception 'INVALID_AMOUNT: expense amount must be positive';
  end if;

  -- lock the event row so concurrent expense writes can't race on the balance snapshot
  perform 1 from public.events where id = p_event_id for update;

  v_balance_before := public.event_balance(p_event_id);
  v_expense_code := public.next_code(p_event_id, 'expense', 'EXP', 4);

  insert into public.expenses (
    event_id, expense_code, category, description, vendor, amount, payment_method,
    recorded_by, spent_at, notes, balance_before, balance_after
  ) values (
    p_event_id, v_expense_code, p_category, p_description, p_vendor, p_amount, p_method,
    auth.uid(), p_spent_at, p_notes, v_balance_before, v_balance_before - p_amount
  ) returning * into v_expense;

  insert into public.audit_logs (event_id, actor_id, actor_email, action, record_type, record_id, new_value)
  values (p_event_id, auth.uid(), (select email from public.admin_profiles where id = auth.uid()),
          'expense_recorded', 'expense', v_expense.id::text, to_jsonb(v_expense));

  return v_expense;
end;
$$;

create or replace function public.void_expense(p_expense_id uuid, p_reason text)
returns public.expenses language plpgsql security definer as $$
declare
  v_before public.expenses;
  v_after public.expenses;
begin
  if not public.has_permission('manage_expenses') then
    raise exception 'PERMISSION_DENIED';
  end if;

  select * into v_before from public.expenses where id = p_expense_id for update;
  if not found then raise exception 'EXPENSE_NOT_FOUND'; end if;

  update public.expenses
    set is_voided = true, voided_at = now(), voided_by = auth.uid(), void_reason = p_reason
    where id = p_expense_id
    returning * into v_after;

  insert into public.audit_logs (event_id, actor_id, actor_email, action, record_type, record_id, previous_value, new_value)
  values (v_after.event_id, auth.uid(), (select email from public.admin_profiles where id = auth.uid()),
          'expense_voided', 'expense', v_after.id::text, to_jsonb(v_before), to_jsonb(v_after));

  return v_after;
end;
$$;

-- ----------------------------------------------------------------------------
-- Finance timeline: unified chronological view of payments + expenses with
-- a running balance, computed purely from stored transactions.
-- ----------------------------------------------------------------------------

create or replace view public.finance_timeline
with (security_invoker = true) as
select
  p.event_id,
  p.id as txn_id,
  p.payment_code as txn_code,
  'payment'::finance_txn_type as txn_type,
  ('Payment from ' || g.full_name || ' (' || g.guest_code || ')') as description,
  p.amount as money_in,
  0::numeric as money_out,
  p.paid_at as txn_date,
  p.created_at,
  p.payment_method,
  null::text as category,
  g.id as guest_id,
  p.is_voided
from public.payments p join public.guests g on g.id = p.guest_id
union all
select
  e.event_id,
  e.id as txn_id,
  e.expense_code as txn_code,
  'expense'::finance_txn_type as txn_type,
  e.description,
  0::numeric as money_in,
  e.amount as money_out,
  e.spent_at as txn_date,
  e.created_at,
  e.payment_method,
  e.category,
  null::uuid as guest_id,
  e.is_voided
from public.expenses e;

-- Note: running balance is computed in the application layer by ordering this
-- view by (txn_date, created_at) and accumulating money_in - money_out, since
-- window functions over a UNION view are simplest to apply at query time in
-- the API layer where voided rows are already filtered out.

-- ----------------------------------------------------------------------------
-- Dashboard/report aggregate, per event
-- ----------------------------------------------------------------------------

create or replace view public.event_dashboard
with (security_invoker = true) as
select
  e.id as event_id,
  e.name, e.year, e.presented_by, e.mens_ticket_price, e.womens_ticket_price, e.status,
  coalesce((select sum(ticket_fee) from public.guests where event_id = e.id), 0) as total_expected_income,
  coalesce((select sum(amount) from public.payments where event_id = e.id and not is_voided), 0) as total_money_received,
  coalesce((select sum(amount) from public.expenses where event_id = e.id and not is_voided), 0) as total_expenses,
  public.event_balance(e.id) as available_balance,
  (select count(*) from public.guests where event_id = e.id) as total_guests,
  (select count(*) from public.guest_financials where event_id = e.id and status = 'paid') as paid_guests,
  (select count(*) from public.guest_financials where event_id = e.id and status = 'part_payment') as part_payment_guests,
  (select count(*) from public.guest_financials where event_id = e.id and status = 'unpaid') as unpaid_guests,
  (select count(*) from public.guests where event_id = e.id and gender = 'male') as male_guests,
  (select count(*) from public.guests where event_id = e.id and gender = 'female') as female_guests,
  coalesce((select sum(ticket_fee) from public.guests where event_id = e.id and gender = 'male'), 0) as male_ticket_revenue,
  coalesce((select sum(ticket_fee) from public.guests where event_id = e.id and gender = 'female'), 0) as female_ticket_revenue
from public.events e;

grant select on public.guest_financials to authenticated;
grant select on public.finance_timeline to authenticated;
grant select on public.event_dashboard to authenticated;
