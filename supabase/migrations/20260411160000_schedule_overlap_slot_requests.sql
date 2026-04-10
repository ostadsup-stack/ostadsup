-- Schedule: no overlapping non-cancelled events per group; slot handoff requests; tighter RLS on schedule_events.
-- Run supabase/queries/audit_schedule_overlaps.sql on existing DBs before applying if you have legacy overlaps.

create extension if not exists btree_gist with schema extensions;

-- ---------------------------------------------------------------------------
-- 1) Exclusion: same group_id + overlapping time, only for active rows
-- ---------------------------------------------------------------------------
alter table public.schedule_events
  drop constraint if exists schedule_events_no_group_overlap;

alter table public.schedule_events
  add constraint schedule_events_no_group_overlap
  exclude using gist (
    group_id with =,
    tstzrange (starts_at, ends_at, '[)') with &&
  )
  where (
    status <> 'cancelled'
  );

-- ---------------------------------------------------------------------------
-- 2) RLS: only creator or workspace owner may update/delete a schedule event
-- ---------------------------------------------------------------------------
drop policy if exists sched_mutate_teacher on public.schedule_events;

drop policy if exists sched_delete_teacher on public.schedule_events;

create policy sched_mutate_teacher on public.schedule_events
for update
using (
  public.is_group_staff (group_id, auth.uid ())
  and (
    created_by = auth.uid ()
    or public.is_workspace_owner (workspace_id, auth.uid ())
  )
)
with check (
  public.is_group_staff (group_id, auth.uid ())
  and workspace_id = public.group_workspace_id (group_id)
);

create policy sched_delete_teacher on public.schedule_events for delete using (
  public.is_group_staff (group_id, auth.uid ())
  and (
    created_by = auth.uid ()
    or public.is_workspace_owner (workspace_id, auth.uid ())
  )
);

-- ---------------------------------------------------------------------------
-- 3) Slot requests (another teacher asks to take a blocking slot)
-- ---------------------------------------------------------------------------
create table public.schedule_slot_requests (
  id uuid primary key default gen_random_uuid (),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  group_id uuid not null references public.groups (id) on delete cascade,
  requester_id uuid not null references public.profiles (id) on delete cascade,
  blocking_event_id uuid not null references public.schedule_events (id) on delete cascade,
  proposed_event_type text not null default 'class',
  proposed_mode text not null default 'on_site' check (proposed_mode in ('on_site', 'online')),
  subject_name text,
  proposed_starts_at timestamptz not null,
  proposed_ends_at timestamptz not null,
  location text,
  meeting_link text,
  note text,
  status text not null default 'pending' check (
    status in ('pending', 'approved', 'rejected', 'cancelled')
  ),
  resolution_event_id uuid references public.schedule_events (id) on delete set null,
  created_at timestamptz not null default now (),
  resolved_at timestamptz,
  constraint schedule_slot_requests_time_ok check (proposed_ends_at > proposed_starts_at),
  constraint schedule_slot_requests_event_type_ok check (
    proposed_event_type in ('class', 'seminar')
  )
);

create index schedule_slot_requests_group_id_idx on public.schedule_slot_requests (group_id);

create index schedule_slot_requests_requester_idx on public.schedule_slot_requests (requester_id);

create unique index schedule_slot_requests_one_pending_per_block
on public.schedule_slot_requests (blocking_event_id, requester_id)
where
  status = 'pending';

alter table public.schedule_slot_requests enable row level security;

create policy ssr_select on public.schedule_slot_requests for select using (
  requester_id = auth.uid ()
  or exists (
    select
      1
    from
      public.schedule_events se
    where
      se.id = schedule_slot_requests.blocking_event_id
      and se.created_by = auth.uid ()
  )
  or public.is_workspace_owner (workspace_id, auth.uid ())
  or public.is_profile_admin (auth.uid ())
);

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
);

create policy ssr_update_requester_cancel on public.schedule_slot_requests for update
using (requester_id = auth.uid () and status = 'pending')
with check (requester_id = auth.uid () and status = 'cancelled');

-- ---------------------------------------------------------------------------
-- 4) Notify blocking teacher when a request is created
-- ---------------------------------------------------------------------------
create or replace function public.notify_schedule_slot_request_created ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  blocker uuid;
  req_name text;
begin
  select
    created_by into blocker
  from
    public.schedule_events
  where
    id = new.blocking_event_id;

  if blocker is null or blocker = new.requester_id then
    return new;
  end if;

  select
    full_name into req_name
  from
    public.profiles
  where
    id = new.requester_id;

  insert into public.notifications(
    user_id,
    workspace_id,
    target_type,
    target_id,
    title,
    body
  )
  values (
    blocker,
    new.workspace_id,
    'schedule_slot_request',
    new.id,
    'طلب حصة',
    coalesce(nullif(trim(req_name), ''), 'أستاذ')
    || ' يطلب أخذ الفترة الزمنية لحصتك. افتح «طلبات الحصص» للموافقة أو الرفض.'
  );

  return new;
end;
$$;

drop trigger if exists trg_notify_schedule_slot_request on public.schedule_slot_requests;

create trigger trg_notify_schedule_slot_request
after insert on public.schedule_slot_requests for each row
execute procedure public.notify_schedule_slot_request_created ();

-- ---------------------------------------------------------------------------
-- 5) Approve / reject (SECURITY DEFINER)
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
      resolved_at = now()
    where
      id = p_request_id;

    return json_build_object('ok', false, 'error', 'blocking_event_missing');
  end if;

  if not (
    blocker = auth.uid ()
    or public.is_workspace_owner (r.workspace_id, auth.uid ())
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
      resolved_at = now()
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
    status
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
    'planned'
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
      resolved_at = now()
    where
      id = p_request_id;

    return json_build_object('ok', false, 'error', 'blocking_event_missing');
  end if;

  if not (
    blocker = auth.uid ()
    or public.is_workspace_owner (r.workspace_id, auth.uid ())
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
