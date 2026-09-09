-- Safe seat constraint migration.
-- Preserve historical rows, but enforce uniqueness only for active assignments.

-- Drop blanket unique constraints blocking released seat reuse.
alter table public.seat_assignments
drop constraint if exists seat_assignments_event_id_bus_id_seat_id_key;

alter table public.seat_assignments
drop constraint if exists seat_assignments_event_id_guest_id_key;

alter table public.seat_assignments
drop constraint if exists seat_assignments_event_id_payment_id_key;

-- Avoid duplicate active seats.
drop index if exists idx_seat_active_seat_unique;
create unique index idx_seat_active_seat_unique
  on public.seat_assignments(event_id, bus_id, seat_id)
  where status = 'occupied';

drop index if exists idx_seat_active_guest_unique;
create unique index idx_seat_active_guest_unique
  on public.seat_assignments(event_id, guest_id)
  where status = 'occupied';

drop index if exists idx_seat_active_payment_unique;
create unique index idx_seat_active_payment_unique
  on public.seat_assignments(event_id, payment_id)
  where status = 'occupied';
