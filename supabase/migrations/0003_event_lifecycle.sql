-- ============================================================================
-- THE REWIND EXPERIENCE — Event lifecycle functions
-- ============================================================================

create or replace function public.switch_active_event(p_event_id uuid)
returns public.events language plpgsql security definer as $$
declare
  v_event public.events;
begin
  if not (public.is_owner() or public.has_permission('manage_event_settings')) then
    raise exception 'PERMISSION_DENIED';
  end if;

  select * into v_event from public.events where id = p_event_id and status = 'active';
  if not found then
    raise exception 'EVENT_NOT_FOUND_OR_ARCHIVED';
  end if;

  update public.events set is_currently_active = false where is_currently_active = true;
  update public.events set is_currently_active = true where id = p_event_id returning * into v_event;

  insert into public.audit_logs (event_id, actor_id, actor_email, action, record_type, record_id)
  values (p_event_id, auth.uid(), (select email from public.admin_profiles where id = auth.uid()),
          'event_switched', 'event', p_event_id::text);

  return v_event;
end;
$$;

create or replace function public.archive_event(p_event_id uuid)
returns public.events language plpgsql security definer as $$
declare
  v_event public.events;
  v_was_active boolean;
begin
  if not public.is_owner() then
    raise exception 'PERMISSION_DENIED: only the Owner can archive an event';
  end if;

  select is_currently_active into v_was_active from public.events where id = p_event_id;

  update public.events
    set status = 'archived', is_currently_active = false, archived_at = now(), archived_by = auth.uid()
    where id = p_event_id
    returning * into v_event;

  -- If we archived the active event, activate the most recently created remaining active event, if any.
  if v_was_active then
    update public.events
      set is_currently_active = true
      where id = (select id from public.events where status = 'active' order by created_at desc limit 1);
  end if;

  insert into public.audit_logs (event_id, actor_id, actor_email, action, record_type, record_id)
  values (p_event_id, auth.uid(), (select email from public.admin_profiles where id = auth.uid()),
          'event_archived', 'event', p_event_id::text);

  return v_event;
end;
$$;

create or replace function public.create_event(
  p_name text, p_year int, p_event_date date, p_presented_by text,
  p_mens_price numeric, p_womens_price numeric
) returns public.events language plpgsql security definer as $$
declare
  v_event public.events;
begin
  if not (public.is_owner() or public.has_permission('create_events')) then
    raise exception 'PERMISSION_DENIED';
  end if;

  insert into public.events (name, year, event_date, presented_by, mens_ticket_price, womens_ticket_price, created_by)
  values (p_name, p_year, p_event_date, p_presented_by, p_mens_price, p_womens_price, auth.uid())
  returning * into v_event;

  insert into public.audit_logs (event_id, actor_id, actor_email, action, record_type, record_id, new_value)
  values (v_event.id, auth.uid(), (select email from public.admin_profiles where id = auth.uid()),
          'event_created', 'event', v_event.id::text, to_jsonb(v_event));

  return v_event;
end;
$$;
