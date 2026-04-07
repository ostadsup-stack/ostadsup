-- كتب/مواد على مستوى المساحة (للعموم) بدون ربط بفوج

alter table public.materials
add column if not exists audience_scope text not null default 'group';

alter table public.materials drop constraint if exists materials_audience_scope_ck;

alter table public.materials
add constraint materials_audience_scope_ck check (
  audience_scope in ('group', 'workspace_public')
);

-- السماح بـ group_id فارغ للمحتوى العام فقط
alter table public.materials drop constraint if exists materials_group_id_fkey;

alter table public.materials alter column group_id drop not null;

alter table public.materials
add constraint materials_group_id_fkey foreign key (group_id) references public.groups (id) on delete cascade;

alter table public.materials drop constraint if exists materials_audience_group_ck;

alter table public.materials
add constraint materials_audience_group_ck check (
  (
    audience_scope = 'group'
    and group_id is not null
  )
  or (
    audience_scope = 'workspace_public'
    and group_id is null
  )
);

comment on column public.materials.audience_scope is
'group: مرتبط بفوج. workspace_public: يظهر للجميع في التطبيق وعلى الصفحة العامة للمساحة.';

-- ---------------------------------------------------------------------------
-- RLS مواد
-- ---------------------------------------------------------------------------
drop policy if exists mat_select on public.materials;

drop policy if exists mat_write_teacher on public.materials;

drop policy if exists mat_update_teacher on public.materials;

drop policy if exists mat_delete_teacher on public.materials;

create policy mat_select on public.materials for select using (
  public.is_profile_admin (auth.uid ())
  or (
    audience_scope = 'workspace_public'
    and group_id is null
    and auth.uid () is not null
  )
  or (
    group_id is not null
    and (
      public.is_group_member (group_id, auth.uid ())
      or public.is_workspace_owner (workspace_id, auth.uid ())
      or public.is_group_staff (group_id, auth.uid ())
    )
  )
);

create policy mat_write_teacher on public.materials for insert
with check (
  created_by = auth.uid ()
  and (
    (
      audience_scope = 'group'
      and group_id is not null
      and public.is_group_staff (group_id, auth.uid ())
      and workspace_id = public.group_workspace_id (group_id)
    )
    or (
      audience_scope = 'workspace_public'
      and group_id is null
      and public.is_workspace_owner (workspace_id, auth.uid ())
    )
  )
);

create policy mat_update_teacher on public.materials
for update
using (
  (
    group_id is not null
    and public.is_group_staff (group_id, auth.uid ())
  )
  or (
    group_id is null
    and audience_scope = 'workspace_public'
    and public.is_workspace_owner (workspace_id, auth.uid ())
  )
);

create policy mat_delete_teacher on public.materials for delete using (
  (
    group_id is not null
    and public.is_group_staff (group_id, auth.uid ())
  )
  or (
    group_id is null
    and audience_scope = 'workspace_public'
    and public.is_workspace_owner (workspace_id, auth.uid ())
  )
);

-- ---------------------------------------------------------------------------
-- أجزاء المواد (material_parts)
-- ---------------------------------------------------------------------------
drop policy if exists mp_select on public.material_parts;

drop policy if exists mp_write_teacher on public.material_parts;

create policy mp_select on public.material_parts for select using (
  exists (
    select 1
    from public.materials m
    where
      m.id = material_parts.material_id
      and (
        public.is_profile_admin (auth.uid ())
        or public.is_workspace_owner (m.workspace_id, auth.uid ())
        or (
          m.group_id is not null
          and (
            public.is_group_member (m.group_id, auth.uid ())
            or public.is_group_staff (m.group_id, auth.uid ())
          )
        )
        or (
          m.group_id is null
          and m.audience_scope = 'workspace_public'
          and auth.uid () is not null
        )
      )
  )
);

create policy mp_write_teacher on public.material_parts for all using (
  exists (
    select 1
    from public.materials m
    where
      m.id = material_parts.material_id
      and (
        (
          m.group_id is not null
          and public.is_group_staff (m.group_id, auth.uid ())
        )
        or (
          m.group_id is null
          and m.audience_scope = 'workspace_public'
          and public.is_workspace_owner (m.workspace_id, auth.uid ())
        )
      )
  )
)
with check (
  exists (
    select 1
    from public.materials m
    where
      m.id = material_parts.material_id
      and (
        (
          m.group_id is not null
          and public.is_group_staff (m.group_id, auth.uid ())
        )
        or (
          m.group_id is null
          and m.audience_scope = 'workspace_public'
          and public.is_workspace_owner (m.workspace_id, auth.uid ())
        )
      )
  )
);

-- ---------------------------------------------------------------------------
-- الصفحة العامة: مواد بما فيها «للعموم»
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
    case
      when m.audience_scope = 'workspace_public' and m.group_id is null then 'للعموم'
      else coalesce(g.group_name, '—')
    end as group_name
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
