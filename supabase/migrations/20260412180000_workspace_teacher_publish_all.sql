-- أي أستاذ مرتبط بفوج في مساحة (مالك أو طاقم) يمكنه النشر على مستوى المساحة
-- والمواد/الكتب «للعموم»، مع محاذاة سياسات التخزين.

create or replace function public.is_workspace_teacher (wid uuid, uid uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select
    public.is_workspace_owner (wid, uid)
    or exists (
      select 1
      from public.groups g
      inner join public.group_staff gs
        on gs.group_id = g.id
        and gs.teacher_id = uid
        and gs.status = 'active'
      where g.workspace_id = wid
    );
$$;

comment on function public.is_workspace_teacher (uuid, uuid) is
'مالك المساحة أو أستاذ نشط في group_staff ضمن إحدى أفواج المساحة.';

grant execute on function public.is_workspace_teacher (uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- posts
-- ---------------------------------------------------------------------------
drop policy if exists posts_insert_teacher on public.posts;

create policy posts_insert_teacher on public.posts for insert
with check (
  author_id = auth.uid ()
  and (
    public.is_workspace_owner (workspace_id, auth.uid ())
    or (
      scope = 'workspace'
      and group_id is null
      and public.is_workspace_teacher (workspace_id, auth.uid ())
    )
  )
);

drop policy if exists posts_update_teacher on public.posts;

create policy posts_update_teacher on public.posts
for update
using (
  author_id = auth.uid ()
  and (
    (
      public.is_workspace_owner (workspace_id, auth.uid ())
    )
    or (
      public.is_group_staff (group_id, auth.uid ())
    )
    or (
      scope = 'workspace'
      and group_id is null
      and public.is_workspace_teacher (workspace_id, auth.uid ())
    )
  )
);

drop policy if exists posts_delete_teacher on public.posts;

create policy posts_delete_teacher on public.posts for delete using (
  public.is_workspace_owner (workspace_id, auth.uid ())
  or (
    group_id is not null
    and public.is_group_staff (group_id, auth.uid ())
    and author_id = auth.uid ()
  )
  or (
    scope = 'workspace'
    and author_id = auth.uid ()
    and public.is_workspace_teacher (workspace_id, auth.uid ())
  )
);

-- ---------------------------------------------------------------------------
-- materials
-- ---------------------------------------------------------------------------
drop policy if exists mat_write_teacher on public.materials;

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
      and public.is_workspace_teacher (workspace_id, auth.uid ())
    )
  )
);

drop policy if exists mat_update_teacher on public.materials;

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
    and (
      public.is_workspace_owner (workspace_id, auth.uid ())
      or (
        created_by = auth.uid ()
        and public.is_workspace_teacher (workspace_id, auth.uid ())
      )
    )
  )
);

drop policy if exists mat_delete_teacher on public.materials;

create policy mat_delete_teacher on public.materials for delete using (
  (
    group_id is not null
    and public.is_group_staff (group_id, auth.uid ())
  )
  or (
    group_id is null
    and audience_scope = 'workspace_public'
    and (
      public.is_workspace_owner (workspace_id, auth.uid ())
      or (
        created_by = auth.uid ()
        and public.is_workspace_teacher (workspace_id, auth.uid ())
      )
    )
  )
);

-- ---------------------------------------------------------------------------
-- material_parts
-- ---------------------------------------------------------------------------
drop policy if exists mp_write_teacher on public.material_parts;

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
          and public.is_workspace_teacher (m.workspace_id, auth.uid ())
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
          and public.is_workspace_teacher (m.workspace_id, auth.uid ())
        )
      )
  )
);

-- ---------------------------------------------------------------------------
-- storage.objects (bucket materials)
-- ---------------------------------------------------------------------------
drop policy if exists materials_upload on storage.objects;

drop policy if exists materials_read on storage.objects;

drop policy if exists materials_update on storage.objects;

drop policy if exists materials_delete on storage.objects;

create policy materials_upload on storage.objects for insert to authenticated
with check (
  bucket_id = 'materials'
  and public.is_workspace_teacher (
    split_part(name, '/', 1)::uuid,
    auth.uid ()
  )
);

create policy materials_read on storage.objects for select to authenticated
using (
  bucket_id = 'materials'
  and (
    (
      split_part(name, '/', 2) = 'public'
      and auth.uid () is not null
    )
    or (
      split_part(name, '/', 2) <> 'public'
      and (
        public.is_group_member (split_part(name, '/', 2)::uuid, auth.uid ())
        or public.is_workspace_owner (split_part(name, '/', 1)::uuid, auth.uid ())
        or public.is_group_staff (split_part(name, '/', 2)::uuid, auth.uid ())
      )
    )
  )
);

create policy materials_update on storage.objects for update to authenticated
using (
  bucket_id = 'materials'
  and public.is_workspace_teacher (
    split_part(name, '/', 1)::uuid,
    auth.uid ()
  )
);

create policy materials_delete on storage.objects for delete to authenticated
using (
  bucket_id = 'materials'
  and public.is_workspace_teacher (
    split_part(name, '/', 1)::uuid,
    auth.uid ()
  )
);
