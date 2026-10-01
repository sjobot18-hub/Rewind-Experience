-- ============================================================================
-- THE REWIND EXPERIENCE
-- Small Costa bus seed
-- ============================================================================
-- Adds a second, smaller public transport bus ("Small Costa") as an alternative
-- for members who could not get a seat on Big Costa.
--
-- The existing schema (event_buses / bus_seats / seat_assignments) already
-- supports multiple buses per event. This migration only seeds the new bus and
-- its seat rows into the SAME event used by the existing seat-selection flow
-- (the currently-active "Rewind Experience" event). It does NOT touch Big
-- Costa rows, does NOT drop any indexes, and does NOT alter seat_assignments.
--
-- Idempotent: re-running only fills in missing rows (on conflict do nothing).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. CREATE SMALL COSTA BUS
-- ----------------------------------------------------------------------------
-- Seeded under the same event that already drives the Big Costa seat flow.
-- Resolved event-aware (active event + name) so there is never any ambiguity
-- with a name-only / seat-count lookup.

insert into public.event_buses (
  event_id,
  name,
  front_seat_label,
  total_rows,
  seats_per_row
)
select
  e.id,
  'Small Costa',
  'F1',
  4,
  3
from public.events e
where e.is_currently_active = true
  and e.name ilike '%Rewind Experience%'
on conflict (event_id, name) do nothing;


-- ----------------------------------------------------------------------------
-- 2. FRONT PASSENGER SEAT (F1)
-- ----------------------------------------------------------------------------

insert into public.bus_seats (
  bus_id,
  seat_number,
  seat_type,
  row_number,
  position_in_row,
  is_disabled
)
select
  eb.id,
  eb.front_seat_label,
  'Front Passenger',
  0,
  1,
  false
from public.event_buses eb
join public.events e on e.id = eb.event_id
where eb.name = 'Small Costa'
  and e.is_currently_active = true
  and e.name ilike '%Rewind Experience%'
on conflict (bus_id, seat_number) do nothing;


-- ----------------------------------------------------------------------------
-- 3. SEATS 01 TO 12  (4 rows x 3 seats)
-- ----------------------------------------------------------------------------
-- Window seats are the first and last positions in each row (position 1 and 3),
-- matching the Big Costa convention of "ends are windows". Position 2 is aisle.
-- Seat numbers are scoped by bus_id, so they overlap with Big Costa numbers
-- without conflict; the API always resolves seats on a specific bus.

with layout as (
  select 1 as row_no, 1 as seat_pos
  union all select 1, 2
  union all select 1, 3

  union all select 2, 1
  union all select 2, 2
  union all select 2, 3

  union all select 3, 1
  union all select 3, 2
  union all select 3, 3

  union all select 4, 1
  union all select 4, 2
  union all select 4, 3
)
insert into public.bus_seats (
  bus_id,
  seat_number,
  seat_type,
  row_number,
  position_in_row,
  is_disabled
)
select
  eb.id,
  lpad(((l.row_no - 1) * 3 + l.seat_pos)::text, 2, '0') as seat_number,
  case
    when l.seat_pos = 1 then 'Window'
    when l.seat_pos = 3 then 'Window'
    else 'Regular'
  end,
  l.row_no,
  l.seat_pos,
  false
from public.event_buses eb
join public.events e on e.id = eb.event_id
cross join layout l
where eb.name = 'Small Costa'
  and e.is_currently_active = true
  and e.name ilike '%Rewind Experience%'
on conflict (bus_id, seat_number) do nothing;
