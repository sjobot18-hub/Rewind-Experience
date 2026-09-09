-- ============================================================================
-- 7. BIG COSTA SEED REPAIR
-- ============================================================================
-- Repair the existing Big Costa bus metadata and seat rows without deleting
-- any legacy bus_seats or seat_assignments rows.

insert into public.event_buses (
  event_id,
  name,
  front_seat_label,
  total_rows,
  seats_per_row
)
select
  e.id,
  'Big Costa',
  'F1',
  7,
  5
from public.events e
where e.name ilike '%Rewind Experience%'
  and not exists (
    select 1
    from public.event_buses eb
    where eb.event_id = e.id
      and eb.name = 'Big Costa'
  )

on conflict (event_id, name) do nothing;

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
  'F1',
  'Front Passenger',
  0,
  1,
  false
from public.event_buses eb
where eb.name = 'Big Costa'
  and not exists (
    select 1
    from public.bus_seats bs
    where bs.bus_id = eb.id
      and bs.seat_number = 'F1'
  )

on conflict (bus_id, seat_number) do nothing;

with bus as (
  select eb.id as bus_id
  from public.event_buses eb
  where eb.name = 'Big Costa'
),
rows as (
  select 1 as row_no, 1 as seat_pos
  union all select 1, 2
  union all select 1, 3
  union all select 1, 4
  union all select 1, 5

  union all select 2, 1
  union all select 2, 2
  union all select 2, 3
  union all select 2, 4
  union all select 2, 5

  union all select 3, 1
  union all select 3, 2
  union all select 3, 3
  union all select 3, 4
  union all select 3, 5

  union all select 4, 1
  union all select 4, 2
  union all select 4, 3
  union all select 4, 4
  union all select 4, 5

  union all select 5, 1
  union all select 5, 2
  union all select 5, 3
  union all select 5, 4
  union all select 5, 5

  union all select 6, 1
  union all select 6, 2
  union all select 6, 3
  union all select 6, 4
  union all select 6, 5

  union all select 7, 1
  union all select 7, 2
  union all select 7, 3
  union all select 7, 4
  union all select 7, 5
),
seat_layout as (
  select
    b.bus_id,
    r.row_no,
    r.seat_pos,
    lpad(((r.row_no - 1) * 5 + r.seat_pos)::text, 2, '0') as seat_number
  from bus b
  cross join rows r
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
  sl.bus_id,
  sl.seat_number,
  case
    when sl.seat_pos = 1 then 'Window'
    when sl.seat_pos = 5 then 'Window'
    else 'Regular'
  end,
  sl.row_no,
  sl.seat_pos,
  false
from seat_layout sl
where not exists (
  select 1
  from public.bus_seats bs
  where bs.bus_id = sl.bus_id
    and bs.seat_number = sl.seat_number
)

on conflict (bus_id, seat_number) do nothing;
