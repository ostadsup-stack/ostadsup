-- حقول إضافية للملف العام + استعلام آمن للزوار

alter table public.profiles add column if not exists specialty text;

alter table public.profiles add column if not exists social_links jsonb not null default '{}'::jsonb;

alter table public.profiles add column if not exists cv_path text;

comment on column public.profiles.specialty is 'التخصص الأكاديمي (للعرض العام).';

comment on column public.profiles.social_links is 'روابط اجتماعية: linkedin, facebook, twitter, website (قيم نصية).';

comment on column public.profiles.cv_path is 'رابط عام لملف السيرة في تخزين avatars (مثل …/cv.pdf).';

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
