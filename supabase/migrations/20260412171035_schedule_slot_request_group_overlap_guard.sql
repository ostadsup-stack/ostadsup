-- Slot request insert could overlap a third active event in the same group (only the
-- blocking event was checked). Approving then cancelled the blocker but INSERT still
-- hit schedule_events_no_group_overlap (EXCLUDE / trigger). Tighten RLS and approve().

drop policy if exists ssr_insert on public.schedule_slot_requests;

create policy ssr_insert on public.schedule_slot_requests for insert
with check (
  requester_id = auth.uid ()
  and public.is_group_staff (group_id, auth.uid ())
  and workspace_id = public.group_workspace_id (group_id)
  and exists (
    select
      1
    from
      public.schedule_events se
    where
      se.id = blocking_event_id
      and se.group_id = group_id
      and se.status <> 'cancelled'
      and se.created_by <> auth.uid ()
      and tstzrange (se.starts_at, se.ends_at, '[)')
      && tstzrange (proposed_starts_at, proposed_ends_at, '[)')
  )
  and not exists (
    select
      1
    from
      public.schedule_events o
    where
      o.group_id = group_id
      and o.id <> blocking_event_id
      and o.status <> 'cancelled'
      and tstzrange (o.starts_at, o.ends_at, '[)')
      && tstzrange (proposed_starts_at, proposed_ends_at, '[)')
  )
);

create or replace function public.approve_schedule_slot_request (p_request_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.schedule_slot_requests%rowtype;
  new_event_id uuid;
  blocker uuid;
begin
  select
    * into r
  from
    public.schedule_slot_requests
  where
    id = p_request_id
  for update;

  if not found then
    return json_build_object('ok', false, 'error', 'not_found');
  end if;

  if r.status <> 'pending' then
    return json_build_object('ok', false, 'error', 'not_pending');
  end if;

  select
    created_by into blocker
  from
    public.schedule_events
  where
    id = r.blocking_event_id
  for update;

  if blocker is null then
    update public.schedule_slot_requests
    set
      status = 'cancelled',
      resolved_at = now ()
    where
      id = p_request_id;

    return json_build_object('ok', false, 'error', 'blocking_event_missing');
  end if;

  if not (
    blocker = auth.uid ()
    or public.is_workspace_owner (r.workspace_id, auth.uid ())
    or public.is_profile_admin (auth.uid ())
  ) then
    return json_build_object('ok', false, 'error', 'forbidden');
  end if;

  if not exists (
    select
      1
    from
      public.schedule_events se
    where
      se.id = r.blocking_event_id
      and se.status <> 'cancelled'
  ) then
    update public.schedule_slot_requests
    set
      status = 'cancelled',
      resolved_at = now ()
    where
      id = p_request_id;

    return json_build_object('ok', false, 'error', 'slot_already_free');
  end if;

  if exists (
    select
      1
    from
      public.schedule_events se
    where
      se.group_id = r.group_id
      and se.id <> r.blocking_event_id
      and se.status <> 'cancelled'
      and tstzrange (se.starts_at, se.ends_at, '[)')
      && tstzrange (r.proposed_starts_at, r.proposed_ends_at, '[)')
  ) then
    return json_build_object('ok', false, 'error', 'proposed_slot_group_overlap');
  end if;

  update public.schedule_events
  set
    status = 'cancelled'
  where
    id = r.blocking_event_id;

  insert into public.schedule_events(
    workspace_id,
    group_id,
    created_by,
    event_type,
    mode,
    subject_name,
    starts_at,
    ends_at,
    location,
    meeting_link,
    note,
    status,
    teacher_cross_group_overlap_ack
  )
  values (
    r.workspace_id,
    r.group_id,
    r.requester_id,
    r.proposed_event_type,
    r.proposed_mode,
    r.subject_name,
    r.proposed_starts_at,
    r.proposed_ends_at,
    r.location,
    r.meeting_link,
    r.note,
    'planned',
    true
  )
  returning
    id into new_event_id;

  update public.schedule_slot_requests
  set
    status = 'approved',
    resolved_at = now (),
    resolution_event_id = new_event_id
  where
    id = p_request_id;

  insert into public.notifications(
    user_id,
    workspace_id,
    target_type,
    target_id,
    title,
    body
  )
  values (
    r.requester_id,
    r.workspace_id,
    'schedule_slot_request',
    p_request_id,
    'تم قبول طلب الحصة',
    'وافق الأستاذ الحاجز على طلبك وثُبِّتت حصتك في الجدول.'
  );

  return json_build_object('ok', true, 'event_id', new_event_id);
end;
$$;

grant execute on function public.approve_schedule_slot_request (uuid) to authenticated;
