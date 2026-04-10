-- =============================================================================
-- teacher_group_list_summaries — نسخة «مالك المساحة فقط» (بدون group_staff)
-- =============================================================================
-- استخدم هذا الملف في SQL Editor إذا لم تُنشَأ بعد جداول multi-teacher
-- (مثل group_staff). يعيد عمود is_owner = true لكل صف.
--
-- بعد التنفيذ: أعد تحميل schema من لوحة Supabase (API settings).
-- =============================================================================

drop function if exists public.teacher_group_list_summaries (timestamptz, timestamptz);

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
  join_code text,
  is_owner boolean
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
    g.join_code,
    true
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
