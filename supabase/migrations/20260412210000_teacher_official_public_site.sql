-- صفحة الأستاذ الرسمية: حقول، RPCs، سياسات تخزين للزائر، وتوسيع صلاحيات تحديث المنشورات

-- ---------------------------------------------------------------------------
-- 1) profiles: ملف أكاديمي وبريد اختياري للصفحة العامة
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists academic_profile jsonb not null default '{}'::jsonb;

alter table public.profiles add column if not exists public_contact_email text;

comment on column public.profiles.academic_profile is 'JSON: rankTitle, institution, degrees[], training[], teachingExperience[], researchInterests[], languages[].';

comment on column public.profiles.public_contact_email is 'بريد يُعرض للعموم عند التفعيل في إعدادات الصفحة.';

-- ---------------------------------------------------------------------------
-- 2) workspaces: إعدادات الصفحة العامة (ترتيب الأقسام، الإظهار، التواصل)
-- ---------------------------------------------------------------------------
alter table public.workspaces add column if not exists public_site_settings jsonb not null default '{}'::jsonb;

comment on column public.workspaces.public_site_settings is 'JSON: section_order[], sections_visible{}, contact_visible{}.';

-- ---------------------------------------------------------------------------
-- 3) posts: نشر المنشور على الصفحة العامة (مساحة فقط)
-- ---------------------------------------------------------------------------
alter table public.posts add column if not exists is_public_on_site boolean not null default false;

alter table public.posts drop constraint if exists posts_public_site_scope_ck;

alter table public.posts add constraint posts_public_site_scope_ck check (
  is_public_on_site = false
  or (
    scope = 'workspace'
    and group_id is null
  )
);

update public.posts
set
  is_public_on_site = true
where
  scope = 'workspace'
  and group_id is null
  and deleted_at is null;

-- ---------------------------------------------------------------------------
-- 4) groups / schedule_events: إظهار مختصر للعموم
-- ---------------------------------------------------------------------------
alter table public.groups add column if not exists show_on_public_site boolean not null default false;

comment on column public.groups.show_on_public_site is 'إظهار بطاقة الفوج في الصفحة العامة (بدون join_code).';

alter table public.schedule_events add column if not exists show_on_public_site boolean not null default false;

comment on column public.schedule_events.show_on_public_site is 'إظهار الحصة في معاينة الجدول العامة (بدون رابط الاجتماع/مكان تفصيلي إن رُفع لاحقاً).';

-- ---------------------------------------------------------------------------
-- 5) دالة للتحقق من مسار تخزين مواد workspace_public (لقراءة anon)
-- ---------------------------------------------------------------------------
create or replace function public.storage_public_materials_object_readable (p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.materials m
    inner join public.workspaces w on w.id = m.workspace_id
    where
      w.status = 'active'
      and m.status = 'published'
      and m.audience_scope = 'workspace_public'
      and m.group_id is null
      and split_part(p_name, '/', 2) = 'public'
      and (m.file_path = p_name or m.cover_path = p_name)
  );
$$;

comment on function public.storage_public_materials_object_readable (text) is
'هل يحق للزائر قراءة هذا المسار في bucket materials (مجلد public ومرتبط بمادة منشورة للعموم).';

grant execute on function public.storage_public_materials_object_readable (text) to anon;

grant execute on function public.storage_public_materials_object_readable (text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6) سياسة تخزين: قراءة anon لملفات/أغلفة المواد العامة
-- ---------------------------------------------------------------------------
drop policy if exists materials_read_public_anon on storage.objects;

create policy materials_read_public_anon on storage.objects for select to anon using (
  bucket_id = 'materials'
  and public.storage_public_materials_object_readable (name)
);

-- سياسة posts_update_teacher (مالك يعدّل منشورات المساحة): تُعرَّف في
-- 20260412180000_workspace_teacher_publish_all.sql عند توفر is_workspace_teacher.
-- لا نكررها هنا حتى لا تفشل الهجرة إن كان المشروع بدون تلك الدالة.

-- ---------------------------------------------------------------------------
-- 7) RPC: بيانات الرأس والإعدادات والملف الأكاديمي
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
  cv_path text,
  academic_profile jsonb,
  public_contact_email text,
  public_site_settings jsonb
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
    p.cv_path,
    coalesce(p.academic_profile, '{}'::jsonb),
    p.public_contact_email,
    coalesce(w.public_site_settings, '{}'::jsonb)
  from public.workspaces w
  inner join public.profiles p on p.id = w.owner_teacher_id
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
-- 8) RPC: مواد المساحة للزائر (مع وصف وغلاف ومسار ملف للعموم فقط)
-- ---------------------------------------------------------------------------
create or replace function public.public_workspace_materials_by_slug (p_slug text)
returns table (
  id uuid,
  title text,
  material_type text,
  link_kind text,
  external_url text,
  group_name text,
  description text,
  cover_path text,
  file_path text,
  publication_year int
)
language sql
stable
security definer
set search_path = public
as $$
  select
    m.id,
    m.title,
    m.material_type,
    m.link_kind,
    case
      when m.material_type = 'reference' then nullif(trim(m.external_url), '')
      else null::text
    end as external_url,
    case
      when m.audience_scope = 'workspace_public' and m.group_id is null then 'للعموم'::text
      else coalesce(g.group_name, '—'::text)
    end as group_name,
    m.description,
    case
      when m.audience_scope = 'workspace_public' and m.group_id is null then m.cover_path
      else null::text
    end as cover_path,
    case
      when
        m.audience_scope = 'workspace_public'
        and m.group_id is null
        and m.material_type in ('book', 'lesson')
      then
        m.file_path
      else null::text
    end as file_path,
    extract(year from m.created_at)::int as publication_year
  from public.materials m
  inner join public.workspaces w on w.id = m.workspace_id
  left join public.groups g on g.id = m.group_id
  where
    w.slug = trim(p_slug)
    and w.status = 'active'
    and m.status = 'published'
    and (
      m.group_id is null
      or (
        g.id is not null
        and g.status = 'active'
      )
    )
  order by m.created_at desc;
$$;

grant execute on function public.public_workspace_materials_by_slug (text) to anon;

grant execute on function public.public_workspace_materials_by_slug (text) to authenticated;

-- ---------------------------------------------------------------------------
-- 9) RPC: منشورات المساحة المنشورة للعموم فقط
-- ---------------------------------------------------------------------------
create or replace function public.public_workspace_posts_by_slug (p_slug text)
returns table (
  id uuid,
  title text,
  content text,
  created_at timestamptz,
  updated_at timestamptz,
  pinned boolean,
  post_type text,
  attachment_url text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.title,
    p.content,
    p.created_at,
    p.updated_at,
    p.pinned,
    p.post_type,
    p.attachment_url
  from public.posts p
  inner join public.workspaces w on w.id = p.workspace_id
  where
    w.slug = trim(p_slug)
    and w.status = 'active'
    and p.deleted_at is null
    and p.scope = 'workspace'
    and p.group_id is null
    and p.is_public_on_site = true
  order by p.pinned desc, p.created_at desc
  limit 80;
$$;

grant execute on function public.public_workspace_posts_by_slug (text) to anon;

grant execute on function public.public_workspace_posts_by_slug (text) to authenticated;

-- ---------------------------------------------------------------------------
-- 10) RPC: منشور واحد للتفاصيل
-- ---------------------------------------------------------------------------
create or replace function public.public_workspace_post_by_slug_and_id (p_slug text, p_post_id uuid)
returns table (
  id uuid,
  title text,
  content text,
  created_at timestamptz,
  updated_at timestamptz,
  pinned boolean,
  post_type text,
  attachment_url text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.title,
    p.content,
    p.created_at,
    p.updated_at,
    p.pinned,
    p.post_type,
    p.attachment_url
  from public.posts p
  inner join public.workspaces w on w.id = p.workspace_id
  where
    w.slug = trim(p_slug)
    and w.status = 'active'
    and p.id = p_post_id
    and p.deleted_at is null
    and p.scope = 'workspace'
    and p.group_id is null
    and p.is_public_on_site = true
  limit 1;
$$;

grant execute on function public.public_workspace_post_by_slug_and_id (text, uuid) to anon;

grant execute on function public.public_workspace_post_by_slug_and_id (text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 11) RPC: أفواج مختصرة للعموم
-- ---------------------------------------------------------------------------
create or replace function public.public_workspace_groups_teaser_by_slug (p_slug text)
returns table (
  id uuid,
  group_name text,
  subject_name text,
  academic_year text,
  study_level text,
  university text,
  faculty text
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
    g.faculty
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

-- ---------------------------------------------------------------------------
-- 12) RPC: معاينة جدول للعموم
-- ---------------------------------------------------------------------------
create or replace function public.public_workspace_schedule_teaser_by_slug (p_slug text)
returns table (
  id uuid,
  starts_at timestamptz,
  ends_at timestamptz,
  subject_name text,
  event_type text,
  mode text,
  group_label text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    e.id,
    e.starts_at,
    e.ends_at,
    e.subject_name,
    e.event_type,
    e.mode::text,
    g.group_name
  from public.schedule_events e
  inner join public.groups g on g.id = e.group_id
  inner join public.workspaces w on w.id = e.workspace_id
  where
    w.slug = trim(p_slug)
    and w.status = 'active'
    and g.status = 'active'
    and e.show_on_public_site = true
    and e.status in ('planned', 'changed')
    and coalesce((w.public_site_settings->'sections_visible'->>'schedule')::boolean, false) = true
  order by e.starts_at asc
  limit 200;
$$;

grant execute on function public.public_workspace_schedule_teaser_by_slug (text) to anon;

grant execute on function public.public_workspace_schedule_teaser_by_slug (text) to authenticated;
