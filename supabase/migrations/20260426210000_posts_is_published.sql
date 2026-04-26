-- حقل نشر للمنشورات: إلغاء النشر يخفي المنشور عن غير المؤلف (مع سياسة SELECT)

alter table public.posts add column if not exists is_published boolean not null default true;

comment on column public.posts.is_published is
  'عند false: المنشور لا يظهر لأعضاء المساحة/الفوج؛ يبقى مرئياً للمؤلف والمدير.';

-- سياسة القراءة: غير المؤلف يرى المنشور فقط إذا كان منشوراً (is_published)
drop policy if exists posts_select on public.posts;

create policy posts_select on public.posts for select using (
  deleted_at is null
  and (
    author_id = auth.uid ()
    or (
      is_published = true
      and hidden_at is null
      and (
        (
          scope = 'group'
          and (
            public.is_group_member (group_id, auth.uid ())
            or public.is_group_staff (group_id, auth.uid ())
          )
        )
        or (
          scope = 'workspace'
          and public.user_in_workspace (workspace_id, auth.uid ())
        )
      )
    )
  )
);

-- الصفحة العامة: منشورات منشورة فقط
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
    and p.hidden_at is null
    and p.is_published = true
    and p.scope = 'workspace'
    and p.group_id is null
    and p.is_public_on_site = true
  order by p.pinned desc, p.created_at desc
  limit 80;
$$;

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
    and p.hidden_at is null
    and p.is_published = true
    and p.scope = 'workspace'
    and p.group_id is null
    and p.is_public_on_site = true
  limit 1;
$$;
