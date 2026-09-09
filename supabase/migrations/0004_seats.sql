-- ============================================================================
-- THE REWIND EXPERIENCE
-- Public bus seat portal schema
-- ============================================================================

-- ============================================================================
-- 1. EVENT SETTINGS
-- ============================================================================

alter table public.events
  add column if not exists seat_selection_open boolean not null default false,
  add column if not exists seat_selection_deadline timestamptz,
  add column if not exists allow_member_seat_changes boolean not null default true;


-- ============================================================================
-- 2. PUBLIC PAYMENT ID
-- ============================================================================

alter table public.payments
  add column if not exists public_payment_id text unique;


-- Generate public payment IDs for existing payments
update public.payments p
set public_payment_id =
  'PAY-' ||
  e.year ||
  '-' ||
  lpad(
    split_part(p.payment_code, 'PAY', 2)::int::text,
    5,
    '0'
  )
from public.events e
where p.event_id = e.id
  and p.public_payment_id is null
  and p.payment_code like 'PAY%';


-- ============================================================================
-- 3. EVENT BUSES
-- ============================================================================

create table if not exists public.event_buses (
  id uuid primary key default gen_random_uuid(),

  event_id uuid not null
    references public.events(id)
    on delete restrict,

  name text not null,

  front_seat_label text not null default 'F1',

  total_rows int not null default 7,

  seats_per_row int not null default 5,

  created_at timestamptz not null default now(),

  unique(event_id, name)
);


-- ============================================================================
-- 4. BUS SEATS
-- ============================================================================

create table if not exists public.bus_seats (
  id uuid primary key default gen_random_uuid(),

  bus_id uuid not null
    references public.event_buses(id)
    on delete cascade,

  seat_number text not null,

  seat_type text not null default 'Regular',

  row_number int not null default 1,

  position_in_row int not null default 1,

  is_disabled boolean not null default false,

  created_at timestamptz not null default now(),

  unique(bus_id, seat_number)
);


-- ============================================================================
-- 5. SEAT ASSIGNMENTS
-- ============================================================================

create table if not exists public.seat_assignments (
  id uuid primary key default gen_random_uuid(),

  event_id uuid not null
    references public.events(id)
    on delete restrict,

  bus_id uuid not null
    references public.event_buses(id)
    on delete restrict,

  seat_id uuid not null
    references public.bus_seats(id)
    on delete restrict,

  guest_id uuid not null
    references public.guests(id)
    on delete restrict,

  payment_id uuid not null
    references public.payments(id)
    on delete restrict,

  status text not null default 'occupied'
    check (status in ('occupied', 'released', 'disabled')),

  assigned_by uuid
    references public.admin_profiles(id),

  assigned_at timestamptz not null default now(),

  updated_at timestamptz not null default now(),

  unique(event_id, bus_id, seat_id),

  unique(event_id, guest_id),

  unique(event_id, payment_id)
);


-- ============================================================================
-- 6. INDEXES
-- ============================================================================

create index if not exists idx_event_buses_event_id
  on public.event_buses(event_id);

create index if not exists idx_bus_seats_bus_id
  on public.bus_seats(bus_id);

create index if not exists idx_seat_assignments_event_bus
  on public.seat_assignments(event_id, bus_id);


-- ============================================================================
-- 7. CREATE BIG COSTA BUS
-- ============================================================================

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
where e.name ilike 'Rewind Experience'
  and not exists (
    select 1
    from public.event_buses eb
    where eb.event_id = e.id
      and eb.name = 'Big Costa'
  );


-- ============================================================================
-- 8. CREATE FRONT PASSENGER SEAT
-- ============================================================================

insert into public.bus_seats (
  bus_id,
  seat_number,
  seat_type,
  row_number,
  position_in_row
)
select
  eb.id,
  'F1',
  'Front Passenger',
  0,
  1
from public.event_buses eb
where eb.name = 'Big Costa'
on conflict (bus_id, seat_number) do nothing;


-- ============================================================================
-- 9. CREATE SEATS 01 TO 35
-- ============================================================================

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
    lpad(
      (
        ((r.row_no - 1) * 5) + r.seat_pos
      )::text,
      2,
      '0'
    ) as seat_number
  from bus b
  cross join rows r
)

insert into public.bus_seats (
  bus_id,
  seat_number,
  seat_type,
  row_number,
  position_in_row
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
  sl.seat_pos
from seat_layout sl
on conflict (bus_id, seat_number) do nothing;


-- ============================================================================
-- 10. ENABLE ROW LEVEL SECURITY
-- ============================================================================

alter table public.event_buses enable row level security;

alter table public.bus_seats enable row level security;

alter table public.seat_assignments enable row level security;


-- ============================================================================
-- 11. REMOVE OLD SEAT POLICIES IF THEY ALREADY EXIST
-- ============================================================================
-- This makes the migration safer to rerun.

drop policy if exists
  "seat maps can be read publicly by everyone"
on public.event_buses;

drop policy if exists
  "bus seats can be read publicly by everyone"
on public.bus_seats;

drop policy if exists
  "seat assignments can be read publicly by seat verifier"
on public.seat_assignments;

drop policy if exists
  "seat assignments can be created by public for self only"
on public.seat_assignments;

drop policy if exists
  "seat assignments can be updated by public for self only"
on public.seat_assignments;

drop policy if exists
  "seat assignments admin write only"
on public.seat_assignments;


-- ============================================================================
-- 12. PUBLIC READ ACCESS TO BUS MAP
-- ============================================================================

create policy
  "seat maps can be read publicly by everyone"
on public.event_buses
for select
using (true);


create policy
  "bus seats can be read publicly by everyone"
on public.bus_seats
for select
using (true);


-- ============================================================================
-- 13. PUBLIC READ ACCESS TO ASSIGNMENTS
-- ============================================================================
-- The portal needs to know which seats are occupied.

create policy
  "seat assignments can be read publicly by seat verifier"
on public.seat_assignments
for select
using (true);


-- ============================================================================
-- 14. PUBLIC INSERT POLICY
-- ============================================================================
-- IMPORTANT:
-- The application server must validate:
--
-- 1. Payment ID
-- 2. Guest ownership
-- 3. Event
-- 4. Seat availability
-- 5. Seat selection window
-- 6. Whether the member is allowed to change seats
--
-- This policy allows the server route to perform the insert.
-- The server-side validation is what prevents one member from assigning
-- another member's payment ID to a seat.

create policy
  "seat assignments can be created by public for self only"
on public.seat_assignments
for insert
with check (true);


-- ============================================================================
-- 15. PREVENT DIRECT PUBLIC UPDATES
-- ============================================================================

create policy
  "seat assignments can be updated by public for self only"
on public.seat_assignments
for update
using (false)
with check (false);


-- ============================================================================
-- 16. PREVENT DIRECT PUBLIC DELETES
-- ============================================================================

create policy
  "seat assignments admin write only"
on public.seat_assignments
for delete
using (false);


-- ============================================================================
-- 17. PUBLIC PAYMENT ID GENERATOR
-- ============================================================================

create or replace function public.generate_public_payment_id(
  p_event_id uuid,
  p_payment_code text
)
returns text
language sql
stable
as $$
  select
    'PAY-' ||
    (
      select year
      from public.events
      where id = p_event_id
    ) ||
    '-' ||
    lpad(
      right(p_payment_code, 5),
      5,
      '0'
    );
$$;


-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================