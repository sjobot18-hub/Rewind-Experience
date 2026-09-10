-- ============================================================================
-- 8. RANDOM PUBLIC PAYMENT ID GENERATOR AND PAYMENT BACKFILL
-- ============================================================================
-- Removes dependency on the historical deterministic ID shape from
-- 0004_seats.sql and teaches payment writes to publish a secure random public
-- reference while retaining the internal payment_code / receipt_number flow.

create extension if not exists pgcrypto;

-- Drop the legacy signature that embeds event_id and payment_code so that
-- the migration is compatible with new workloads that no longer need that
-- deterministic formula.
drop function if exists public.generate_public_payment_id(uuid, text);

-- Replace the old sequential / event-derived public ID generator with a
-- true secure-random one that emits PAY-###### values in the 100000-999999
-- range. The loop protects against collisions by re-trying until a unique
-- public_payment_id is found.
create or replace function public.generate_public_payment_id()
returns text
language plpgsql
security definer
as $$
declare
  v_seed bytea;
  v_value bigint;
  v_public_id text;
begin
  loop
    v_seed := gen_random_bytes(4);
    v_value := (
      get_byte(v_seed, 0)::bigint * 16777216 +
      get_byte(v_seed, 1)::bigint * 65536 +
      get_byte(v_seed, 2)::bigint * 256 +
      get_byte(v_seed, 3)::bigint
    ) % 900000;

    v_public_id := 'PAY-' || lpad((v_value + 100000)::text, 6, '0');

    if not exists (
      select 1 from public.payments where public_payment_id = v_public_id
    ) then
      return v_public_id;
    end if;
  end loop;
end;
$$;

-- Replace the payment-write source of truth so every new payment writes a
-- random public ID with the existing payment_code and receipt_number unchanged.
create or replace function public.record_payment(
  p_event_id uuid,
  p_guest_id uuid,
  p_amount numeric,
  p_method payment_method,
  p_paid_at date,
  p_notes text default null
)
returns public.payments
language plpgsql
security definer as $$
declare
  v_guest public.guests;
  v_paid_so_far numeric;
  v_payment_code text;
  v_receipt_number text;
  v_public_payment_id text;
  v_payment public.payments;
  v_is_over boolean;
begin
  if not public.has_permission('manage_payments') then
    raise exception 'PERMISSION_DENIED: manage_payments required';
  end if;

  if p_amount <= 0 then
    raise exception 'INVALID_AMOUNT: payment amount must be positive';
  end if;

  select * into v_guest
    from public.guests
    where id = p_guest_id and event_id = p_event_id
    for update;

  if not found then
    raise exception 'GUEST_NOT_FOUND';
  end if;

  select coalesce(sum(amount), 0) into v_paid_so_far
    from public.payments
    where guest_id = p_guest_id and not is_voided;

  v_is_over := (v_paid_so_far + p_amount) > v_guest.ticket_fee;

  v_payment_code := public.next_code(p_event_id, 'payment', 'PAY', 4);
  v_receipt_number := public.next_code(p_event_id, 'receipt', 'REC', 4);
  v_public_payment_id := public.generate_public_payment_id();

  insert into public.payments (
    event_id,
    guest_id,
    payment_code,
    public_payment_id,
    receipt_number,
    amount,
    payment_method,
    received_by,
    paid_at,
    notes,
    is_overpayment
  )
  values (
    p_event_id,
    p_guest_id,
    v_payment_code,
    v_public_payment_id,
    v_receipt_number,
    p_amount,
    p_method,
    auth.uid(),
    p_paid_at,
    p_notes,
    v_is_over
  )
  returning * into v_payment;

  insert into public.audit_logs (
    event_id,
    actor_id,
    actor_email,
    action,
    record_type,
    record_id,
    new_value
  )
  values (
    p_event_id,
    auth.uid(),
    (select email from public.admin_profiles where id = auth.uid()),
    'payment_recorded',
    'payment',
    v_payment.id::text,
    to_jsonb(v_payment)
  );

  return v_payment;
end;
$$;

-- Backfill existing rows that are empty or still stuck in a deterministic
-- PATTERN from the old public generator. This is safe to re-run because
-- payments already carrying PAY-###### strings are deliberately skipped.
update public.payments p
set public_payment_id = public.generate_public_payment_id()
where p.public_payment_id is null
   or p.public_payment_id !~ '^PAY-[0-9]{6}$';
