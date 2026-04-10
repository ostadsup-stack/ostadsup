-- =============================================================================
-- Ostadi — مزامنة يدوية مع Supabase (SQL Editor)
-- =============================================================================
-- نفّذ هذا الملف إذا كان مشروعك على السحابة أقدم من هجرات المستودع، أو ظهرت
-- أخطاء مثل: Could not find the 'bio' column of 'profiles' in the schema cache
--
-- بعد التنفيذ:
--   1) من لوحة Supabase: Settings → API → Reload schema (أو انتظر دقيقة)
--   2) جرّب في SQL Editor (اختياري، يحدّث مخطط PostgREST):
--        notify pgrst, 'reload schema';
--   3) إن ظهر تنبيه group_staff في الأسفل، نفّذ بالكامل:
--        supabase/migrations/20260408120000_multi_teacher_groups.sql
-- =============================================================================

-- ---------------------------------------------------------------------------
-- أعمدة profiles (نموذج الأستاذ + الموقع العام) — idempotent
-- ---------------------------------------------------------------------------
alter table public.profiles
add column if not exists phone text;

alter table public.profiles
add column if not exists whatsapp text;

alter table public.profiles
add column if not exists bio text;

alter table public.profiles
add column if not exists office_hours text;

alter table public.profiles
add column if not exists specialty text;

alter table public.profiles
add column if not exists social_links jsonb not null default '{}'::jsonb;

alter table public.profiles
add column if not exists cv_path text;

comment on column public.profiles.phone is 'هاتف للعرض والتواصل (اختياري)';
comment on column public.profiles.whatsapp is 'رقم واتساب أو رابط wa.me (اختياري)';
comment on column public.profiles.bio is 'بطاقة تعريفية قصيرة (اختياري)';
comment on column public.profiles.office_hours is 'أوقات التواصل / الاستقبال (نص حر)';
comment on column public.profiles.specialty is 'التخصص الأكاديمي (للعرض العام).';
comment on column public.profiles.social_links is 'روابط اجتماعية: linkedin, facebook, twitter, website (قيم نصية).';
comment on column public.profiles.cv_path is 'رابط عام لملف السيرة في تخزين avatars (مثل …/cv.pdf).';

-- ---------------------------------------------------------------------------
-- استعلام الزوار (يتطلب الأعمدة أعلاه)
-- ---------------------------------------------------------------------------
create or replace function public.public_teacher_by_workspace_slug (p_slug text)
returns table (
  workspace_display_name text,
  workspace_slug text,
  full_name text,
  specialty text,
  bio text,
  avatar_url text,
  phone text,
  whatsapp text,
  office_hours text,
  social_links jsonb,
  cv_path text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    w.display_name,
    w.slug,
    p.full_name,
    p.specialty,
    p.bio,
    p.avatar_url,
    p.phone,
    p.whatsapp,
    p.office_hours,
    coalesce(p.social_links, '{}'::jsonb),
    p.cv_path
  from public.workspaces w
  join public.profiles p on p.id = w.owner_teacher_id
  where
    w.slug = trim(p_slug)
    and w.status = 'active'
    and p.status = 'active'
    and p.role in ('teacher', 'admin')
  limit 1;
$$;

grant execute on function public.public_teacher_by_workspace_slug (text) to anon;

grant execute on function public.public_teacher_by_workspace_slug (text) to authenticated;

-- ---------------------------------------------------------------------------
-- تذكير: ربط أستاذ بفوج أستاذ آخر (قائمة فارغة → رمز ربط الأستاذ)
-- ---------------------------------------------------------------------------
do $$
begin
  if
    not exists (
      select 1
      from information_schema.tables
      where
        table_schema = 'public'
        and table_name = 'group_staff'
    )
  then
    raise notice
      'Ostadi: جدول group_staff غير موجود. نفّذ بالكامل الملف: supabase/migrations/20260408120000_multi_teacher_groups.sql ثم أعد تحميل مخطط الـ API.';
  end if;

  if
    not exists (
      select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where
        n.nspname = 'public'
        and p.proname = 'redeem_teacher_group_link'
    )
  then
    raise notice
      'Ostadi: الدالة redeem_teacher_group_link غير موجودة. نفّذ هجرة multi_teacher_groups.sql أعلاه.';
  end if;
end
$$;
