-- Coordinator display name in teacher_group_list_summaries; linked teacher self-revoke; owner archive group.

drop function if exists public.teacher_group_list_summaries (timestamptz, timestamptz);

create function public.teacher_group_list_summaries (
  p_today_start timestamptz,
  p_today_end timestamptz
)
returns table (
  group_id uuid,
  group_name text,
  study_level text,
  cohort_official_code text,
  academic_year text,
  student_count bigint,
  unread_count bigint,
  unread_coordinator_count bigint,
  today_event_subject text,
  today_event_starts_at timestamptz,
  today_event_ends_at timestamptz,
  today_event_mode text,
  join_code text,
  is_owner boolean,
  accent_color text,
  coordinator_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    g.id,
    g.group_name,
    g.study_level,
    g.cohort_official_code,
    g.academic_year,
    coalesce(
      (
        select count(*)::bigint
        from public.group_members gm
        where
          gm.group_id = g.id
          and gm.role_in_group = 'student'
          and gm.status = 'active'
      ),
      0
    ),
    coalesce(
      (
        select count(*)::bigint
        from public.messages m
        inner join public.conversations c on c.id = m.conversation_id
        where
          c.group_id = g.id
          and m.sender_id <> (select auth.uid ())
          and m.read_at is null
      ),
      0
    ),
    coalesce(
      (
        select count(*)::bigint
        from public.messages m
        inner join public.conversations c on c.id = m.conversation_id
        where
          c.group_id = g.id
          and c.conversation_type = 'teacher_coordinator'
          and m.sender_id <> (select auth.uid ())
          and m.read_at is null
      ),
      0
    ),
    te.subject_name,
    te.starts_at,
    te.ends_at,
    te.mode::text,
    g.join_code,
    exists (
      select 1
      from public.workspaces ow
      where ow.id = g.workspace_id and ow.owner_teacher_id = (select auth.uid ())
    ),
    g.accent_color,
    (
      select
        nullif(
          trim(
            both
            from
              coalesce(nullif(trim(gm.display_name), ''), p.full_name, '')
          ),
          ''
        )
      from
        public.group_members gm
        inner join public.profiles p on p.id = gm.user_id
      where
        gm.group_id = g.id
        and gm.role_in_group = 'coordinator'
        and gm.status = 'active'
      order by
        gm.joined_at asc nulls last
      limit
        1
    )
  from
    public.groups g
    left join lateral (
      select
        se.subject_name,
        se.starts_at,
        se.ends_at,
        se.mode
      from
        public.schedule_events se
      where
        se.group_id = g.id
        and se.status = 'planned'
        and se.starts_at < p_today_end
        and se.ends_at > p_today_start
      order by
        se.starts_at asc
      limit
        1
    ) te on true
  where
    g.status = 'active'
    and (
      exists (
        select 1
        from public.workspaces w
        where w.id = g.workspace_id and w.owner_teacher_id = (select auth.uid ())
      )
      or exists (
        select 1
        from public.group_staff gs
        where
          gs.group_id = g.id
          and gs.teacher_id = (select auth.uid ())
          and gs.status = 'active'
      )
    )
  order by
    g.created_at desc;
$$;

grant execute on function public.teacher_group_list_summaries (timestamptz, timestamptz) to authenticated;

-- Linked teacher revokes own staff row (no direct RLS update on group_staff for self)
create or replace function public.revoke_own_group_staff (p_group_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  if auth.uid () is null then
    return json_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  if
    exists (
      select 1
      from public.workspaces w
      join public.groups g on g.workspace_id = w.id
      where
        g.id = p_group_id
        and w.owner_teacher_id = auth.uid ()
    )
  then
    return json_build_object('ok', false, 'error', 'owner_use_archive');
  end if;

  update public.group_staff gs
  set
    status = 'revoked'
  where
    gs.group_id = p_group_id
    and gs.teacher_id = auth.uid ()
    and gs.status = 'active';

  get diagnostics n = row_count;

  if n = 0 then
    return json_build_object('ok', false, 'error', 'not_linked');
  end if;

  return json_build_object('ok', true);
end;
$$;

grant execute on function public.revoke_own_group_staff (uuid) to authenticated;

-- Workspace owner archives a group (explicit; matches groups_update_teacher intent)
create or replace function public.archive_group_by_owner (p_group_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  wid uuid;
begin
  if auth.uid () is null then
    return json_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select
    g.workspace_id into wid
  from
    public.groups g
  where
    g.id = p_group_id
    and g.status = 'active';

  if wid is null then
    return json_build_object('ok', false, 'error', 'not_found');
  end if;

  if not public.is_workspace_owner (wid, auth.uid ()) then
    return json_build_object('ok', false, 'error', 'forbidden');
  end if;

  update public.groups
  set
    status = 'archived'
  where
    id = p_group_id;

  return json_build_object('ok', true);
end;
$$;

grant execute on function public.archive_group_by_owner (uuid) to authenticated;
