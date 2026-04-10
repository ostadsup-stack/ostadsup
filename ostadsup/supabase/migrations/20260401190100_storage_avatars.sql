-- صور شخصية: مسار الملف = "{user_id}/avatar.{ext}" — قراءة عامة، الكتابة لصاحب الحساب فقط
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy avatars_insert_own on storage.objects for insert to authenticated
with check (
  bucket_id = 'avatars'
  and split_part(name, '/', 1) = auth.uid ()::text
);

create policy avatars_update_own on storage.objects for update to authenticated
using (
  bucket_id = 'avatars'
  and split_part(name, '/', 1) = auth.uid ()::text
);

create policy avatars_delete_own on storage.objects for delete to authenticated
using (
  bucket_id = 'avatars'
  and split_part(name, '/', 1) = auth.uid ()::text
);
