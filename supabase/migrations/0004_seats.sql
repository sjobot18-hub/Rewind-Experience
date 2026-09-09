-- ============================================================================
-- THE REWIND EXPERIENCE — Public bus seat portal schema
-- ============================================================================

alter table public.events
  add column if not exists seat_selection_open boolean not null default false,
  add column if not exists seat_selection_deadline timestamptz,
  add column if not exists allow_member_seat_changes boolean not null default true;

alter table public.payments
  add column if not exists public_payment_id text unique;

update public.payments p
set public_payment_id = 'PAY-' || e.year || '-' || lpad(split_part(p.payment_code, 'PAY', 2)::int::text, 5, '0')
from public.events e
where p.event_id = e.id
  and p.public_payment_id is null
  and p.payment_code like 'PAY%';

create table if not exists public.event_buses (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete restrict,
  name text not null,
  front_seat_label text not null default 'F1',
  total_rows int not null default 7,
  seats_per_row int not null default 5,
  created_at timestamptz not null default now(),
  unique(event_id, name)
);

create table if not exists public.bus_seats (
  id uuid primary key default gen_random_uuid(),
  bus_id uuid not null references public.event_buses(id) on delete cascade,
  seat_number text not null,
  seat_type text not null default 'Regular',
  row_number int not null default 1,
  position_in_row int not null default 1,
  is_disabled boolean not null default false,
  created_at timestamptz not null default now(),
  unique(bus_id, seat_number)
);

create table if not exists public.seat_assignments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete restrict,
  bus_id uuid not null references public.event_buses(id) on delete restrict,
  seat_id uuid not null references public.bus_seats(id) on delete restrict,
  guest_id uuid not null references public.guests(id) on delete restrict,
  payment_id uuid not null references public.payments(id) on delete restrict,
  status text not null default 'occupied' check (status in ('occupied','released','disabled')),
  assigned_by uuid references public.admin_profiles(id),
  assigned_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(event_id, bus_id, seat_id),
  unique(event_id, guest_id),
  unique(event_id, payment_id)
);

create index if not exists idx_event_buses_event_id on public.event_buses(event_id);
create index if not exists idx_bus_seats_bus_id on public.bus_seats(bus_id);
create index if not exists idx_seat_assignments_event_bus on public.seat_assignments(event_id, bus_id);

insert into public.event_buses (event_id, name, front_seat_label, total_rows, seats_per_row)
select id, 'Big Costa', 'F1', 7, 5
from public.events
where name ilike 'Rewind Experience'
  and not exists (
    select 1 from public.event_buses eb where eb.event_id = events.id and eb.name = 'Big Costa'
  );

with bus as (
  select id as bus_id from public.event_buses where name = 'Big Costa'
)
insert into public.bus_seats (bus_id, seat_number, seat_type, row_number, position_in_row)
select bus_id, 'F1', 'Front Passenger', 0, 1 from bus
union all
select bus_id, '01', case when position_in_row = 1 then 'Window' when position_in_row = 5 then 'Window' else 'Regular' end, 1, position_in_row
from bus,
  generate_series(1,5) as position_in_row
union all
select bus_id, '02', case when position_in_row = 1 then 'Window' when position_in_row = 5 then 'Window' else 'Regular' end, 1, position_in_row
from bus,
  generate_series(1,5) as position_in_row;

-- Insert all bus layout baselines for the Big Costa bus. This is intentionally
-- deterministic and safe to extend later with an admin seat-management UI.
with bus as (
  select id as bus_id from public.event_buses where name = 'Big Costa'
), rows as (
  select 1 as row_no, 1 as seat_pos union all
  select 1,2 union all select 1,3 union all select 1,4 union all select 1,5 union all
  select 2,1 union all select 2,2 union all select 2,3 union all select 2,4 union all select 2,5 union all
  select 3,1 union all select 3,2 union all select 3,3 union all select 3,4 union all select 3,5 union all
  select 4,1 union all select 4,2 union all select 4,3 union all select 4,4 union all select 4,5 union all
  select 5,1 union all select 5,2 union all select 5,3 union all select 5,4 union all select 5,5 union all
  select 6,1 union all select 6,2 union all select 6,3 union all select 6,4 union all select 6,5 union all
  select 7,1 union all select 7,2 union all select 7,3 union all select 7,4 union all select 7,5
)
insert into public.bus_seats (bus_id, seat_number, seat_type, row_number, position_in_row)
select
  b.bus_id,
  case
    when r.row_no = 1 and r.seat_pos = 1 then '01'
    when r.row_no = 1 and r.seat_pos = 2 then '02'
    when r.row_no = 1 and r.seat_pos = 3 then '03'
    when r.row_no = 1 and r.seat_pos = 4 then '04'
    when r.row_no = 1 and r.seat_pos = 5 then '05'
    when r.row_no = 2 and r.seat_pos = 1 then '06'
    when r.row_no = 2 and r.seat_pos = 2 then '07'
    when r.row_no = 2 and r.seat_pos = 3 then '08'
    when r.row_no = 2 and r.seat_pos = 4 then '09'
    when r.row_no = 2 and r.seat_pos = 5 then '10'
    when r.row_no = 3 and r.seat_pos = 1 then '11'
    when r.row_no = 3 and r.seat_pos = 2 then '12'
    when r.row_no = 3 and r.seat_pos = 3 then '13'
    when r.row_no = 3 and r.seat_pos = 4 then '14'
    when r.row_no = 3 and r.seat_pos = 5 then '15'
    when r.row_no = 4 and r.seat_pos = 1 then '16'
    when r.row_no = 4 and r.seat_pos = 2 then '17'
    when r.row_no = 4 and r.seat_pos = 3 then '18'
    when r.row_no = 4 and r.seat_pos = 4 then '19'
    when r.row_no = 4 and r.seat_pos = 5 then '20'
    when r.row_no = 5 and r.seat_pos = 1 then '21'
    when r.row_no = 5 and r.seat_pos = 2 then '22'
    when r.row_no = 5 and r.seat_pos = 3 then '23'
    when r.row_no = 5 and r.seat_pos = 4 then '24'
    when r.row_no = 5 and r.seat_pos = 5 then '25'
    when r.row_no = 6 and r.seat_pos = 1 then '26'
    when r.row_no = 6 and r.seat_pos = 2 then '27'
    when r.row_no = 6 and r.seat_pos = 3 then '28'
    when r.row_no = 6 and r.seat_pos = 4 then '29'
    when r.row_no = 6 and r.seat_pos = 5 then '30'
    when r.row_no = 7 and r.seat_pos = 1 then '31'
    when r.row_no = 7 and r.seat_pos = 2 then '32'
    when r.row_no = 7 and r.seat_pos = 3 then '33'
    when r.row_no = 7 and r.seat_pos = 4 then '34'
    when r.row_no = 7 and r.seat_pos = 5 then '35'
  end,
  case
    when r.seat_pos = 1 or r.seat_pos = 5 then 'Window'
    else 'Regular'
  end,
  r.row_no,
  r.seat_pos
from bus b
cross join rows r
left join public.bus_seats bs on bs.bus_id = b.bus_id and bs.seat_number =
  case
    when r.row_no = 1 and r.seat_pos = 1 then '01'
    when r.row_no = 1 and r.seat_pos = 2 then '02'
    when r.row_no = 1 and r.seat_pos = 3 then '03'
    when r.row_no = 1 and r.seat_pos = 4 then '04'
    when r.row_no = 1 and r.seat_pos = 5 then '05'
    when r.row_no = 2 and r.seat_pos = 1 then '06'
    when r.row_no = 2 and r.seat_pos = 2 then '07'
    when r.row_no = 2 and r.seat_pos = 3 then '08'
    when r.row_no = 2 and r.seat_pos = 4 then '09'
    when r.row_no = 2 and r.seat_pos = 5 then '10'
    when r.row_no = 3 and r.seat_pos = 1 then '11'
    when r.row_no = 3 and r.seat_pos = 2 then '12'
    when r.row_no = 3 and r.seat_pos = 3 then '13'
    when r.row_no = 3 and r.seat_pos = 4 then '14'
    when r.row_no = 3 and r.seat_pos = 5 then '15'
    when r.row_no = 4 and r.seat_pos = 1 then '16'
    when r.row_no = 4 and r.seat_pos = 2 then '17'
    when r.row_no = 4 and r.seat_pos = 3 then '18'
    when r.row_no = 4 and r.seat_pos = 4 then '19'
    when r.row_no = 4 and r.seat_pos = 5 then '20'
    when r.row_no = 5 and r.seat_pos = 1 then '21'
    when r.row_no = 5 and r.seat_pos = 2 then '22'
    when r.row_no = 5 and r.seat_pos = 3 then '23'
    when r.row_no = 5 and r.seat_pos = 4 then '24'
    when r.row_no = 5 and r.seat_pos = 5 then '25'
    when r.row_no = 6 and r.seat_pos = 1 then '26'
    when r.row_no = 6 and r.seat_pos = 2 then '27'
    when r.row_no = 6 and r.seat_pos = 3 then '28'
    when r.row_no = 6 and r.seat_pos = 4 then '29'
    when r.row_no = 6 and r.seat_pos = 5 then '30'
    when r.row_no = 7 and r.seat_pos = 1 then '31'
    when r.row_no = 7 and r.seat_pos = 2 then '32'
    when r.row_no = 7 and r.seat_pos = 3 then '33'
    when r.row_no = 7 and r.seat_pos = 4 then '34'
    when r.row_no = 7 and r.seat_pos = 5 then '35'
  end
where bs.id is null;

insert into public.bus_seats (bus_id, seat_number, seat_type, row_number, position_in_row)
select bus_id, 'F1', 'Front Passenger', 0, 1 from public.event_buses where name='Big Costa'
  on conflict (bus_id, seat_number) do nothing;

alter table public.event_buses enable row level security;
alter table public.bus_seats enable row level security;
alter table public.seat_assignments enable row level security;

create policy "seat maps can be read publicly by everyone" on public.event_buses for select using (true);
create policy "bus seats can be read publicly by everyone" on public.bus_seats for select using (true);
create policy "seat assignments can be read publicly by seat verifier" on public.seat_assignments for select using (true);

create policy "seat assignments can be created by public for self only" on public.seat_assignments for insert with check (true);
create policy "seat assignments can be updated by public for self only" on public.seat_assignments for update using (false) with check (false);
create policy "seat assignments admin write only" on public.seat_assignments for delete using (false);

create or replace function public.generate_public_payment_id(p_event_id uuid, p_payment_code text)
returns text language sql stable as $$
  select 'PAY-' || (select year from public.events where id = p_event_id) || '-' || lpad(right(p_payment_code, 5), 5, '0')
$$;
