-- Cross-group same-teacher overlap requires teacher_cross_group_overlap_ack (unless admin/owner acts).
-- App admin may update/delete any staff-visible schedule row; notify original creator on owner/admin changes.

alter table public.schedule_events
  add column if not exists teacher_cross_group_overlap_ack boolean not null default false;

comment on column public.schedule_events.teacher_cross_group_overlap_ack is
  'True when the teacher accepted overlapping their own slots across different groups.';

-- ---------------------------------------------------------------------------
-- BEFORE: same created_by, different group_id, overlapping time
-- ---------------------------------------------------------------------------
create or replace function public.enforce_teacher_cross_group_schedule_overlap ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid ();
begin
  if new.status = 'cancelled' then
    return new;
  end if;

  if uid is not null
  and (
    public.is_profile_admin (uid)
    or public.is_workspace_owner (new.workspace_id, uid)
  ) then
    return new;
  end if;

  if coalesce (new.teacher_cross_group_overlap_ack, false) then
    return new;
  end if;

  if exists (
    select
      1
    from
      public.schedule_events se
    where
      se.created_by = new.created_by
      and se.group_id is distinct from new.group_id
      and se.id is distinct from new.id
      and se.status <> 'cancelled'
      and tstzrange (se.starts_at, se.ends_at, '[)')
      && tstzrange (new.starts_at, new.ends_at, '[)')
  ) then
    raise exception using
      message = 'teacher_schedule_cross_group_overlap',
      detail = 'Same teacher cannot overlap two different groups without acknowledgement.',
      errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_teacher_cross_group_schedule_overlap on public.schedule_events;

create trigger trg_enforce_teacher_cross_group_schedule_overlap
before insert or update on public.schedule_events for each row
execute procedure public.enforce_teacher_cross_group_schedule_overlap ();

-- ---------------------------------------------------------------------------
-- RLS: app admin may update/delete like workspace owner
-- ---------------------------------------------------------------------------
drop policy if exists sched_mutate_teacher on public.schedule_events;

create policy sched_mutate_teacher on public.schedule_events
for update
using (
  (
    public.is_group_staff (group_id, auth.uid ())
    or public.is_profile_admin (auth.uid ())
  )
  and (
    created_by = auth.uid ()
    or public.is_workspace_owner (workspace_id, auth.uid ())
    or public.is_profile_admin (auth.uid ())
  )
)
with check (
  (
    public.is_group_staff (group_id, auth.uid ())
    or public.is_profile_admin (auth.uid ())
  )
  and workspace_id = public.group_workspace_id (group_id)
);

drop policy if exists sched_delete_teacher on public.schedule_events;

create policy sched_delete_teacher on public.schedule_events for delete using (
  (
    public.is_group_staff (group_id, auth.uid ())
    or public.is_profile_admin (auth.uid ())
  )
  and (
    created_by = auth.uid ()
    or public.is_workspace_owner (workspace_id, auth.uid ())
    or public.is_profile_admin (auth.uid ())
  )
);

-- ---------------------------------------------------------------------------
-- Notify schedule creator when admin or workspace owner changes/deletes their event
-- ---------------------------------------------------------------------------
create or replace function public.notify_schedule_event_creator_on_staff_change ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid ();
  wid uuid;
  target uuid;
  actor_name text;
begin
  if actor is null then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    wid := old.workspace_id;
    target := old.created_by;
    if target is null or target = actor then
      return old;
    end if;
    if not (
      public.is_profile_admin (actor)
      or public.is_workspace_owner (wid, actor)
    ) then
      return old;
    end if;

    select
      coalesce (nullif (trim (full_name), ''), 'مسؤول')
    into actor_name
    from
      public.profiles
    where
      id = actor;

    insert into public.notifications (
      user_id,
      workspace_id,
      target_type,
      target_id,
      title,
      body
    )
    values (
      target,
      wid,
      'schedule_event_changed',
      old.id,
      'تعديل على جدولك',
      coalesce (actor_name, 'مسؤول')
      || ' حذف حصة من جدولك. راجع جدولك أو تواصل مع الإدارة.'
    );
    return old;
  end if;

  wid := new.workspace_id;
  target := new.created_by;
  if target is null or target = actor then
    return new;
  end if;
  if not (
    public.is_profile_admin (actor)
    or public.is_workspace_owner (wid, actor)
  ) then
    return new;
  end if;

  if new.starts_at is not distinct from old.starts_at
  and new.ends_at is not distinct from old.ends_at
  and new.status is not distinct from old.status
  and new.event_type is not distinct from old.event_type
  and new.mode is not distinct from old.mode
  and new.subject_name is not distinct from old.subject_name
  and new.location is not distinct from old.location
  and new.meeting_link is not distinct from old.meeting_link
  and new.note is not distinct from old.note
  and new.teacher_cross_group_overlap_ack is not distinct from old.teacher_cross_group_overlap_ack
  then
    return new;
  end if;

  select
    coalesce (nullif (trim (full_name), ''), 'مسؤول')
  into actor_name
  from
    public.profiles
  where
    id = actor;

  insert into public.notifications (
    user_id,
    workspace_id,
    target_type,
    target_id,
    title,
    body
  )
  values (
    target,
    wid,
    'schedule_event_changed',
    new.id,
    'تعديل على جدولك',
    coalesce (actor_name, 'مسؤول') || ' عدّل حصة في جدولك. راجع جدول الفوج.'
  );
  return new;
end;
$$;

drop trigger if exists trg_notify_schedule_event_creator_update on public.schedule_events;

drop trigger if exists trg_notify_schedule_event_creator_delete on public.schedule_events;

create trigger trg_notify_schedule_event_creator_update
after update on public.schedule_events for each row
execute procedure public.notify_schedule_event_creator_on_staff_change ();

create trigger trg_notify_schedule_event_creator_delete
after delete on public.schedule_events for each row
execute procedure public.notify_schedule_event_creator_on_staff_change ();

-- ---------------------------------------------------------------------------
-- Slot request RPCs: admin may approve/reject; approved insert sets overlap ack
-- ---------------------------------------------------------------------------
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

create or replace function public.reject_schedule_slot_request (p_request_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.schedule_slot_requests%rowtype;
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
    id = r.blocking_event_id;

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

  update public.schedule_slot_requests
  set
    status = 'rejected',
    resolved_at = now ()
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
    'رفض طلب الحصة',
    'رفض الأستاذ الحاجز طلب أخذ الفترة الزمنية. غيّر الوقت أو ألغِ الطلب من «طلبات الحصص».'
  );

  return json_build_object('ok', true);
end;
$$;

grant execute on function public.approve_schedule_slot_request (uuid) to authenticated;

grant execute on function public.reject_schedule_slot_request (uuid) to authenticated;
