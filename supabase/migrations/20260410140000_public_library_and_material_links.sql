-- روابط خارجية للمواد (ندوة / فيديو / رابط) + استعلامات عامة للصفحة الرسمية

alter table public.materials
add column if not exists external_url text;

alter table public.materials
add column if not exists link_kind text;

alter table public.materials drop constraint if exists materials_link_kind_ck;

alter table public.materials
add constraint materials_link_kind_ck check (
  link_kind is null
  or link_kind in ('seminar', 'video', 'link')
);

comment on column public.materials.external_url is 'رابط ويب للنوع reference (ندوة، فيديو، مرجع)';
comment on column public.materials.link_kind is 'تصنيف عرض اختياري للروابط: seminar | video | link';

-- ---------------------------------------------------------------------------
-- قائمة مواد المساحة للزائر (بدون مسارات ملفات خاصة)
-- ---------------------------------------------------------------------------
create or replace function public.public_workspace_materials_by_slug (p_slug text)
returns table (
  id uuid,
  title text,
  material_type text,
  link_kind text,
  external_url text,
  group_name text
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
    g.group_name
  from public.materials m
  inner join public.groups g on g.id = m.group_id
  inner join public.workspaces w on w.id = m.workspace_id
  where
    w.slug = trim(p_slug)
    and w.status = 'active'
    and g.status = 'active'
    and m.status = 'published'
  order by m.created_at desc;
$$;

grant execute on function public.public_workspace_materials_by_slug (text) to anon;

grant execute on function public.public_workspace_materials_by_slug (text) to authenticated;

-- ---------------------------------------------------------------------------
-- منشورات مستوى المساحة للزائر
-- ---------------------------------------------------------------------------
create or replace function public.public_workspace_posts_by_slug (p_slug text)
returns table (
  id uuid,
  title text,
  content text,
  created_at timestamptz,
  pinned boolean
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
    p.pinned
  from public.posts p
  inner join public.workspaces w on w.id = p.workspace_id
  where
    w.slug = trim(p_slug)
    and w.status = 'active'
    and p.deleted_at is null
    and p.scope = 'workspace'
    and p.group_id is null
  order by p.pinned desc, p.created_at desc
  limit 80;
$$;

grant execute on function public.public_workspace_posts_by_slug (text) to anon;

grant execute on function public.public_workspace_posts_by_slug (text) to authenticated;
