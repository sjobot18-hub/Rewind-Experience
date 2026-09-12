-- ============================================================================
-- 10. Filter deleted guests from guest_financials view
-- ============================================================================
-- Updated guest_financials to exclude soft-deleted guests so they no longer
-- appear in the dashboard, guest list, or any consumer of this view.
-- Financial totals (total_paid, balance, etc.) already correctly exclude
-- voided payments — this change only filters the guest row itself.
-- ============================================================================

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
where g.deleted_at is null
group by g.id;
