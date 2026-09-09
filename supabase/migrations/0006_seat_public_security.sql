-- ============================================================================
-- THE REWIND EXPERIENCE
-- Seat Portal Security Tightening
-- ============================================================================

-- Enable RLS
alter table public.event_buses enable row level security;
alter table public.bus_seats enable row level security;
alter table public.seat_assignments enable row level security;


-- ============================================================================
-- REMOVE OLD / UNSAFE SEAT ASSIGNMENT POLICIES
-- ============================================================================

drop policy if exists "seat assignments can be created by public for self only"
on public.seat_assignments;

drop policy if exists "seat assignments can be updated by public for self only"
on public.seat_assignments;

drop policy if exists "seat assignments can be read publicly by seat verifier"
on public.seat_assignments;

drop policy if exists "seat assignments admin write only"
on public.seat_assignments;

drop policy if exists "seat assignments can be created only by trusted server"
on public.seat_assignments;

drop policy if exists "seat assignments can be updated only by trusted server"
on public.seat_assignments;


-- ============================================================================
-- PUBLIC READ ACCESS
--
-- The public seat portal needs to know the bus layout and seat inventory.
-- It does NOT need direct access to seat_assignments.
--
-- The trusted server route reads seat_assignments using the service role and
-- returns only safe public fields.
-- ============================================================================

drop policy if exists "seat maps can be read publicly by everyone"
on public.event_buses;

create policy "seat maps can be read publicly by everyone"
on public.event_buses
for select
using (true);


drop policy if exists "bus seats can be read publicly by everyone"
on public.bus_seats;

create policy "bus seats can be read publicly by everyone"
on public.bus_seats
for select
using (true);


-- ============================================================================
-- SEAT ASSIGNMENTS
--
-- NO PUBLIC SELECT POLICY.
--
-- NO PUBLIC INSERT POLICY.
--
-- NO PUBLIC UPDATE POLICY.
--
-- NO PUBLIC DELETE POLICY.
--
-- All seat assignment reads and writes must go through trusted server routes
-- using the Supabase service role client.
-- ============================================================================

create policy "seat assignments public insert denied"
on public.seat_assignments
for insert
with check (false);

create policy "seat assignments public update denied"
on public.seat_assignments
for update
using (false)
with check (false);

create policy "seat assignments public delete denied"
on public.seat_assignments
for delete
using (false);


-- ============================================================================
-- IMPORTANT
--
-- No SELECT policy is intentionally created for seat_assignments.
--
-- Therefore anonymous/authenticated browser clients cannot query the table.
-- The server-side service-role client bypasses RLS and is responsible for:
--
-- 1. Payment verification
-- 2. ₦5,000 eligibility calculation
-- 3. Seat availability checks
-- 4. Seat assignment
-- 5. Seat changes
-- 6. Admin seat release
-- 7. Public-safe seat map responses
-- ============================================================================
