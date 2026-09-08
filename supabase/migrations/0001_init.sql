-- ============================================================================
-- THE REWIND EXPERIENCE — Core Schema
-- ============================================================================
-- This migration creates the full data model and Row Level Security (RLS)
-- policies that enforce permissions AT THE DATABASE LEVEL. This means that
-- even if someone bypasses the frontend entirely and calls the Supabase API
-- directly, they still cannot read or write data they are not authorized for.
--
-- Run this with: supabase db push
-- or paste it into the Supabase SQL editor.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- ENUM TYPES
-- ----------------------------------------------------------------------------

create type admin_role as enum ('owner', 'finance_admin', 'event_admin', 'custom_admin');
create type admin_status as enum ('active', 'deactivated');
create type guest_gender as enum ('male', 'female');
create type guest_status as enum ('unpaid', 'part_payment', 'paid');
create type payment_method as enum ('cash', 'transfer', 'pos');
create type event_status as enum ('active', 'archived');
create type invitation_status as enum ('pending', 'accepted', 'expired', 'revoked');
create type finance_txn_type as enum ('payment', 'expense');

-- ----------------------------------------------------------------------------
-- PERMISSIONS (fixed catalogue referenced by admin_permissions)
-- ----------------------------------------------------------------------------
-- view_dashboard, manage_guests, manage_payments, manage_expenses,
-- view_finance, manage_reports, export_data, manage_event_settings,
-- create_events, manage_administrators, invite_administrators,
-- view_audit_logs, manage_backups, delete_records

-- ----------------------------------------------------------------------------
-- ADMIN PROFILES
-- ----------------------------------------------------------------------------
-- Mirrors auth.users (Supabase Auth handles password hashing/storage — we
-- never touch or store raw or hashed passwords ourselves).

create table public.admin_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null unique,
  role admin_role not null default 'custom_admin',
  status admin_status not null default 'active',
  is_owner boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references public.admin_profiles(id),
  deactivated_at timestamptz,
  deactivated_by uuid references public.admin_profiles(id)
);

-- Only ever one owner. Enforced via partial unique index.
create unique index one_owner_only on public.admin_profiles (is_owner) where is_owner = true;

create table public.admin_permissions (
  admin_id uuid not null references public.admin_profiles(id) on delete cascade,
  permission text not null,
  granted_at timestamptz not null default now(),
  granted_by uuid references public.admin_profiles(id),
  primary key (admin_id, permission)
);

-- ----------------------------------------------------------------------------
-- ADMIN INVITATIONS
-- ----------------------------------------------------------------------------

create table public.admin_invitations (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null,
  role admin_role not null default 'custom_admin',
  permissions text[] not null default '{}',
  token_hash text not null unique, -- sha256 hash of the raw token; raw token is only ever in the emailed link
  status invitation_status not null default 'pending',
  invited_by uuid not null references public.admin_profiles(id),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_admin_id uuid references public.admin_profiles(id),
  created_at timestamptz not null default now()
);

create index on public.admin_invitations (token_hash);
create index on public.admin_invitations (email);

-- ----------------------------------------------------------------------------
-- PASSWORD RESET REQUESTS (audit trail only — Supabase Auth performs the
-- actual reset; this table lets the Owner see reset activity in the audit log)
-- ----------------------------------------------------------------------------

create table public.password_reset_requests (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references public.admin_profiles(id),
  email text not null,
  requested_at timestamptz not null default now(),
  ip_address text
);

-- ----------------------------------------------------------------------------
-- EVENTS
-- ----------------------------------------------------------------------------

create table public.events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  year int not null,
  event_date date,
  presented_by text not null default 'Beach/Apartment Hangout',
  mens_ticket_price numeric(12,2) not null,
  womens_ticket_price numeric(12,2) not null,
  currency text not null default 'NGN',
  status event_status not null default 'active',
  is_currently_active boolean not null default false, -- the single globally "selected" event shown by default
  created_at timestamptz not null default now(),
  created_by uuid references public.admin_profiles(id),
  archived_at timestamptz,
  archived_by uuid references public.admin_profiles(id)
);

create unique index one_currently_active_event on public.events (is_currently_active) where is_currently_active = true;

-- ----------------------------------------------------------------------------
-- GUESTS
-- ----------------------------------------------------------------------------

create table public.guests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete restrict,
  guest_code text not null, -- e.g. TRE001, unique WITHIN an event
  full_name text not null,
  phone_number text not null,
  gender guest_gender not null,
  ticket_fee numeric(12,2) not null, -- captured permanently at registration time
  notes text,
  registered_at timestamptz not null default now(),
  registered_by uuid references public.admin_profiles(id),
  updated_at timestamptz not null default now(),
  unique (event_id, guest_code)
);

create index on public.guests (event_id);
create index on public.guests (phone_number);
create index on public.guests (full_name);

-- ----------------------------------------------------------------------------
-- PAYMENTS
-- ----------------------------------------------------------------------------

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete restrict,
  guest_id uuid not null references public.guests(id) on delete restrict,
  payment_code text not null, -- PAY0001, unique within event
  receipt_number text not null, -- REC0001, unique within event
  amount numeric(12,2) not null check (amount > 0),
  payment_method payment_method not null,
  received_by uuid not null references public.admin_profiles(id),
  paid_at date not null default current_date,
  notes text,
  is_overpayment boolean not null default false,
  is_voided boolean not null default false,
  voided_at timestamptz,
  voided_by uuid references public.admin_profiles(id),
  void_reason text,
  created_at timestamptz not null default now(),
  unique (event_id, payment_code),
  unique (event_id, receipt_number)
);

create index on public.payments (event_id);
create index on public.payments (guest_id);

-- ----------------------------------------------------------------------------
-- EXPENSES
-- ----------------------------------------------------------------------------

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete restrict,
  expense_code text not null, -- EXP0001, unique within event
  category text not null,
  description text not null,
  vendor text,
  amount numeric(12,2) not null check (amount > 0),
  payment_method payment_method not null,
  recorded_by uuid not null references public.admin_profiles(id),
  spent_at date not null default current_date,
  notes text,
  balance_before numeric(12,2) not null,
  balance_after numeric(12,2) not null,
  is_voided boolean not null default false,
  voided_at timestamptz,
  voided_by uuid references public.admin_profiles(id),
  void_reason text,
  created_at timestamptz not null default now(),
  unique (event_id, expense_code)
);

create index on public.expenses (event_id);

-- ----------------------------------------------------------------------------
-- AUDIT LOG (append-only; nobody can update or delete rows, enforced by RLS)
-- ----------------------------------------------------------------------------

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events(id),
  actor_id uuid references public.admin_profiles(id),
  actor_email text,
  action text not null,
  record_type text,
  record_id text,
  previous_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);

create index on public.audit_logs (event_id);
create index on public.audit_logs (created_at desc);

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Returns true if the currently authenticated user is the Owner.
create or replace function public.is_owner()
returns boolean language sql stable security definer as $$
  select coalesce((select is_owner from public.admin_profiles where id = auth.uid() and status = 'active'), false);
$$;

-- Returns true if the currently authenticated active admin holds a given permission.
create or replace function public.has_permission(perm text)
returns boolean language sql stable security definer as $$
  select
    public.is_owner()
    or exists (
      select 1 from public.admin_permissions ap
      join public.admin_profiles p on p.id = ap.admin_id
      where ap.admin_id = auth.uid()
        and ap.permission = perm
        and p.status = 'active'
    );
$$;

-- Returns true if the currently authenticated user is an active admin at all.
create or replace function public.is_active_admin()
returns boolean language sql stable security definer as $$
  select exists (select 1 from public.admin_profiles where id = auth.uid() and status = 'active');
$$;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

alter table public.admin_profiles enable row level security;
alter table public.admin_permissions enable row level security;
alter table public.admin_invitations enable row level security;
alter table public.password_reset_requests enable row level security;
alter table public.events enable row level security;
alter table public.guests enable row level security;
alter table public.payments enable row level security;
alter table public.expenses enable row level security;
alter table public.audit_logs enable row level security;

-- ---- admin_profiles ----
create policy "admins can view all admin profiles"
  on public.admin_profiles for select
  using (public.is_active_admin());

create policy "owner can insert admin profiles"
  on public.admin_profiles for insert
  with check (public.is_owner());

create policy "owner can update admin profiles, admins cannot edit themselves"
  on public.admin_profiles for update
  using (public.is_owner() and id <> auth.uid())
  with check (public.is_owner() and id <> auth.uid() and is_owner = false);
  -- the "is_owner = false" check blocks anyone from ever promoting a second owner via update

create policy "nobody can delete the owner or any admin profile"
  on public.admin_profiles for delete
  using (false);

-- ---- admin_permissions ----
create policy "admins can view permissions"
  on public.admin_permissions for select
  using (public.is_active_admin());

create policy "only owner can grant/revoke permissions, never for self"
  on public.admin_permissions for insert
  with check (public.is_owner() and admin_id <> auth.uid());

create policy "only owner can delete permissions, never for self"
  on public.admin_permissions for delete
  using (public.is_owner() and admin_id <> auth.uid());

-- ---- admin_invitations ----
create policy "admins with invite permission can view invitations"
  on public.admin_invitations for select
  using (public.has_permission('invite_administrators'));

create policy "admins with invite permission can create invitations"
  on public.admin_invitations for insert
  with check (
    public.has_permission('invite_administrators')
    and not ('owner' = role::text) -- cannot invite someone as Owner
  );

create policy "invited admin can accept via server-side function only"
  on public.admin_invitations for update
  using (public.has_permission('invite_administrators'));
  -- Note: the actual "accept invitation" flow runs through a SECURITY DEFINER
  -- Postgres function (accept_invitation, defined in 0002) using the service
  -- role, NOT this policy, because the person accepting has no session yet.

-- ---- password_reset_requests ----
create policy "owner can view password reset audit trail"
  on public.password_reset_requests for select
  using (public.is_owner());

-- inserts happen via service role from the API route, not directly by clients

-- ---- events ----
create policy "active admins can view events"
  on public.events for select
  using (public.is_active_admin());

create policy "admins with create_events can insert events"
  on public.events for insert
  with check (public.has_permission('create_events'));

create policy "admins with manage_event_settings can update events"
  on public.events for update
  using (public.has_permission('manage_event_settings') or public.has_permission('create_events'));

create policy "nobody deletes events, only archive"
  on public.events for delete
  using (false);

-- ---- guests ----
create policy "admins with guest access can view guests"
  on public.guests for select
  using (public.has_permission('manage_guests') or public.has_permission('view_dashboard'));

create policy "admins with manage_guests can insert guests"
  on public.guests for insert
  with check (public.has_permission('manage_guests'));

create policy "admins with manage_guests can update guests"
  on public.guests for update
  using (public.has_permission('manage_guests'));

create policy "only delete_records + manage_guests can delete guests"
  on public.guests for delete
  using (public.has_permission('manage_guests') and public.has_permission('delete_records'));

-- ---- payments ----
create policy "admins with payments/finance access can view payments"
  on public.payments for select
  using (public.has_permission('manage_payments') or public.has_permission('view_finance'));

create policy "admins with manage_payments can insert payments"
  on public.payments for insert
  with check (public.has_permission('manage_payments'));

create policy "admins with manage_payments can update (void) payments"
  on public.payments for update
  using (public.has_permission('manage_payments'));

create policy "only delete_records + manage_payments can delete payments"
  on public.payments for delete
  using (public.has_permission('manage_payments') and public.has_permission('delete_records'));

-- ---- expenses ----
create policy "admins with expenses/finance access can view expenses"
  on public.expenses for select
  using (public.has_permission('manage_expenses') or public.has_permission('view_finance'));

create policy "admins with manage_expenses can insert expenses"
  on public.expenses for insert
  with check (public.has_permission('manage_expenses'));

create policy "admins with manage_expenses can update (void) expenses"
  on public.expenses for update
  using (public.has_permission('manage_expenses'));

create policy "only delete_records + manage_expenses can delete expenses"
  on public.expenses for delete
  using (public.has_permission('manage_expenses') and public.has_permission('delete_records'));

-- ---- audit_logs: append-only, viewable only by permitted admins ----
create policy "admins with view_audit_logs can view audit log"
  on public.audit_logs for select
  using (public.has_permission('view_audit_logs'));

create policy "any active admin action can write an audit entry"
  on public.audit_logs for insert
  with check (public.is_active_admin());

create policy "audit log can never be updated"
  on public.audit_logs for update
  using (false);

create policy "audit log can never be deleted"
  on public.audit_logs for delete
  using (false);

-- ============================================================================
-- SEED: bootstrap the first event (The Rewind Experience 2026)
-- Note: the Owner account itself is NOT seeded here — see README for how the
-- first Owner is created safely (via Supabase dashboard, never via public
-- sign-up).
-- ============================================================================

insert into public.events (name, year, presented_by, mens_ticket_price, womens_ticket_price, status, is_currently_active)
values ('The Rewind Experience', 2026, 'Beach/Apartment Hangout', 35000, 25000, 'active', true);
