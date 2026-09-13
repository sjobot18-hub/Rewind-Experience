-- ============================================================================
-- THE REWIND EXPERIENCE — Games Management
-- ============================================================================
-- Creates public.games table for organizing games by event location.
-- Games belong to an event and support Beach/Apartment locations.
-- RLS policies use the existing manage_event_settings permission.
-- ============================================================================

create table public.games (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  location text not null check (location in ('beach', 'apartment')),
  description text,
  tiktok_url text,
  video_url text,
  notes text,
  status text not null default 'pending',
  is_completed boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.admin_profiles(id)
);

create index idx_games_event_id on public.games(event_id);
create index idx_games_location on public.games(location);
create index idx_games_is_completed on public.games(is_completed);

alter table public.games enable row level security;

create policy "admins with event settings access can view games"
  on public.games for select
  using (public.has_permission('manage_event_settings') or public.is_owner());

create policy "admins with event settings access can insert games"
  on public.games for insert
  with check (public.has_permission('manage_event_settings') or public.is_owner());

create policy "admins with event settings access can update games"
  on public.games for update
  using (public.has_permission('manage_event_settings') or public.is_owner());

create policy "admins with event settings access can delete games"
  on public.games for delete
  using (public.has_permission('manage_event_settings') or public.is_owner());
