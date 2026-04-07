-- Private bucket: object name = "{workspace_id}/{group_id}/{filename}"
insert into storage.buckets (id, name, public)
values ('materials', 'materials', false)
on conflict (id) do nothing;

create policy materials_upload on storage.objects for insert to authenticated
with check (
  bucket_id = 'materials'
  and public.is_workspace_owner (
    split_part(name, '/', 1)::uuid,
    auth.uid ()
  )
);

create policy materials_read on storage.objects for select to authenticated
using (
  bucket_id = 'materials'
  and (
    public.is_group_member (split_part(name, '/', 2)::uuid, auth.uid ())
    or public.is_workspace_owner (split_part(name, '/', 1)::uuid, auth.uid ())
  )
);

create policy materials_update on storage.objects for update to authenticated
using (
  bucket_id = 'materials'
  and public.is_workspace_owner (split_part(name, '/', 1)::uuid, auth.uid ())
);

create policy materials_delete on storage.objects for delete to authenticated
using (
  bucket_id = 'materials'
  and public.is_workspace_owner (split_part(name, '/', 1)::uuid, auth.uid ())
);
