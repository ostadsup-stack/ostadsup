-- التوقيت (عادي/ميسر) والمسار (عادي/تميّز) لكل فوج

alter table public.groups
  add column if not exists schedule_mode text not null default 'normal';

alter table public.groups
  add column if not exists study_track text not null default 'normal';

alter table public.groups drop constraint if exists groups_schedule_mode_ck;

alter table public.groups
  add constraint groups_schedule_mode_ck check (schedule_mode in ('normal', 'simplified'));

alter table public.groups drop constraint if exists groups_study_track_ck;

alter table public.groups
  add constraint groups_study_track_ck check (study_track in ('normal', 'excellence'));

comment on column public.groups.schedule_mode is 'توقيت الحصص: عادي (normal) أو ميسر (simplified).';

comment on column public.groups.study_track is 'المسار: عادي (normal) أو تميّز (excellence).';

-- ---------------------------------------------------------------------------
-- teacher_group_list_summaries: إرجاع الحقلين
-- ---------------------------------------------------------------------------
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
  coordinator_name text,
  schedule_mode text,
  study_track text
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
    ),
    g.schedule_mode,
    g.study_track
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

-- ---------------------------------------------------------------------------
-- الصفحة العامة: عرض نمط التوقيت والمسار إن وُجد
-- ---------------------------------------------------------------------------
drop function if exists public.public_workspace_groups_teaser_by_slug (text);

create or replace function public.public_workspace_groups_teaser_by_slug (p_slug text)
returns table (
  id uuid,
  group_name text,
  subject_name text,
  academic_year text,
  study_level text,
  university text,
  faculty text,
  schedule_mode text,
  study_track text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    g.id,
    g.group_name,
    g.subject_name,
    g.academic_year,
    g.study_level::text,
    g.university,
    g.faculty,
    g.schedule_mode,
    g.study_track
  from public.groups g
  inner join public.workspaces w on w.id = g.workspace_id
  where
    w.slug = trim(p_slug)
    and w.status = 'active'
    and g.status = 'active'
    and g.show_on_public_site = true
  order by g.created_at desc
  limit 40;
$$;

grant execute on function public.public_workspace_groups_teaser_by_slug (text) to anon;
grant execute on function public.public_workspace_groups_teaser_by_slug (text) to authenticated;

notify pgrst, 'reload schema';
