-- Cohort metadata, teacher group list RPC, mark messages read

alter table public.groups
  add column if not exists study_level text not null default 'licence'
    check (study_level in ('licence', 'master', 'doctorate'));

alter table public.groups
  add column if not exists cohort_official_code text;

alter table public.groups
  add column if not exists cohort_sequence int;

alter table public.groups
  add column if not exists cohort_suffix text;

create unique index if not exists groups_workspace_cohort_official_code_uidx
  on public.groups (workspace_id, cohort_official_code)
  where cohort_official_code is not null;

-- Teacher inbox: mark others' messages read when opening thread (owner or participant)
create or replace function public.mark_conversation_messages_read (p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  wid uuid;
  uid uuid;
begin
  uid := auth.uid ();
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  select c.workspace_id into wid
  from public.conversations c
  where c.id = p_conversation_id;

  if wid is null then
    raise exception 'not_found';
  end if;

  if
    not exists (
      select 1
      from public.workspaces w
      where w.id = wid and w.owner_teacher_id = uid
    )
    and not exists (
      select 1
      from public.conversation_participants p
      where p.conversation_id = p_conversation_id and p.user_id = uid
    )
  then
    raise exception 'forbidden';
  end if;

  update public.messages m
  set
    read_at = now ()
  where
    m.conversation_id = p_conversation_id
    and m.sender_id <> uid
    and m.read_at is null;
end;
$$;

grant execute on function public.mark_conversation_messages_read (uuid) to authenticated;

-- One row per group for teacher dashboard list
create or replace function public.teacher_group_list_summaries (
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
  today_event_subject text,
  today_event_starts_at timestamptz,
  today_event_ends_at timestamptz,
  today_event_mode text,
  join_code text
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
    te.subject_name,
    te.starts_at,
    te.ends_at,
    te.mode::text,
    g.join_code
  from public.groups g
  inner join public.workspaces w on w.id = g.workspace_id
  left join lateral (
    select
      se.subject_name,
      se.starts_at,
      se.ends_at,
      se.mode
    from public.schedule_events se
    where
      se.group_id = g.id
      and se.status = 'planned'
      and se.starts_at < p_today_end
      and se.ends_at > p_today_start
    order by se.starts_at asc
    limit 1
  ) te on true
  where
    w.owner_teacher_id = (select auth.uid ())
    and g.status = 'active'
  order by g.created_at desc;
$$;

grant execute on function public.teacher_group_list_summaries (timestamptz, timestamptz) to authenticated;
