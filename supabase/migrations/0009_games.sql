-- ============================================================================
-- THE REWIND EXPERIENCE — Games Management
-- ============================================================================

create type game_location as enum ('beach', 'apartment');
create type game_status as enum ('pending', 'completed');

create table public.games (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  location game_location not null,
  description text,
  tiktok_url text,
  notes text,
  status game_status not null default 'pending',
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index on public.games (event_id);
create index on public.games (status);
create index on public.games (location);

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
