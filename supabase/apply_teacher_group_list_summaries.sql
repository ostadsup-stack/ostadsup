-- =============================================================================
-- teacher_group_list_summaries — للصق في Supabase SQL Editor
-- =============================================================================
-- يصلح: "Could not find the function ... in the schema cache" أو غياب GRANT
-- أو فشل CREATE OR REPLACE بعد تغيير أعمدة الإرجاع.
--
-- المتطلبات:
--   - جداول: groups (مع study_level, cohort_*), workspaces, group_members,
--     schedule_events, conversations, messages
--   - جدول group_staff (هجرة multi-teacher). إن لم يكن موجوداً، نفّذ أولاً:
--     supabase/migrations/20260408120000_multi_teacher_groups.sql
--
-- بعد التنفيذ: من لوحة Supabase → Settings → API → Reload schema (أو أعد تشغيل المشروع).
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
    exists (
      select 1
      from public.workspaces ow
      where ow.id = g.workspace_id and ow.owner_teacher_id = (select auth.uid ())
    )
  from public.groups g
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
  order by g.created_at desc;
$$;

grant execute on function public.teacher_group_list_summaries (timestamptz, timestamptz) to authenticated;
