-- Denormalize blocking teacher on slot requests (reliable RLS/UI + notifications).
-- Fixes: embed hiding blocking_event.created_by, and ensures notify trigger targets the right profile.

alter table public.schedule_slot_requests
add column if not exists blocking_creator_id uuid references public.profiles (id) on delete cascade;

update public.schedule_slot_requests s
set
  blocking_creator_id = e.created_by
from
  public.schedule_events e
where
  e.id = s.blocking_event_id
  and s.blocking_creator_id is null;

alter table public.schedule_slot_requests
alter column blocking_creator_id set not null;

create or replace function public.trg_schedule_slot_requests_set_blocking_creator ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select
    se.created_by into strict new.blocking_creator_id
  from
    public.schedule_events se
  where
    se.id = new.blocking_event_id;

  return new;
end;
$$;

drop trigger if exists trg_schedule_slot_requests_blocking_creator on public.schedule_slot_requests;

create trigger trg_schedule_slot_requests_blocking_creator
before insert on public.schedule_slot_requests for each row
execute procedure public.trg_schedule_slot_requests_set_blocking_creator ();

-- Select: use column (avoids RLS quirks in EXISTS subquery on schedule_events)
drop policy if exists ssr_select on public.schedule_slot_requests;

create policy ssr_select on public.schedule_slot_requests for select using (
  requester_id = auth.uid ()
  or blocking_creator_id = auth.uid ()
  or public.is_workspace_owner (workspace_id, auth.uid ())
  or public.is_profile_admin (auth.uid ())
);

-- Notify blocking teacher (by stable id on the row)
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
  blocker := new.blocking_creator_id;

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
    || ' يطلب أخذ الفترة الزمنية لحصتك. يمكنك الموافقة أو الرفض من هنا أو من «طلبات الحصص».'
  );

  return new;
end;
$$;

-- Idempotent: requester can call if trigger did not fire (e.g. old deploy)
create or replace function public.ensure_schedule_slot_request_notification (p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.schedule_slot_requests%rowtype;
  req_name text;
begin
  if auth.uid () is null then
    raise exception 'not_authenticated';
  end if;

  select
    * into r
  from
    public.schedule_slot_requests
  where
    id = p_request_id;

  if not found then
    return;
  end if;

  if r.requester_id <> auth.uid () then
    raise exception 'forbidden';
  end if;

  if r.blocking_creator_id is null or r.blocking_creator_id = r.requester_id then
    return;
  end if;

  if
    exists (
      select
        1
      from
        public.notifications n
      where
        n.target_type = 'schedule_slot_request'
        and n.target_id = p_request_id
        and n.user_id = r.blocking_creator_id
    )
  then
    return;
  end if;

  select
    full_name into req_name
  from
    public.profiles
  where
    id = r.requester_id;

  insert into public.notifications(
    user_id,
    workspace_id,
    target_type,
    target_id,
    title,
    body
  )
  values (
    r.blocking_creator_id,
    r.workspace_id,
    'schedule_slot_request',
    r.id,
    'طلب حصة',
    coalesce(nullif(trim(req_name), ''), 'أستاذ')
    || ' يطلب أخذ الفترة الزمنية لحصتك. يمكنك الموافقة أو الرفض من هنا أو من «طلبات الحصص».'
  );
end;
$$;

grant execute on function public.ensure_schedule_slot_request_notification (uuid) to authenticated;
