-- طالب / منسق نشط: نشر على حائط فوج واحد فقط (لا workspace-wide، لا تثبيت).
create policy posts_insert_group_member on public.posts for insert
with check (
  author_id = auth.uid ()
  and scope = 'group'
  and group_id is not null
  and pinned = false
  and exists (
    select 1
    from public.groups g
    where
      g.id = posts.group_id
      and g.workspace_id = posts.workspace_id
      and public.is_group_member (g.id, auth.uid ())
  )
);
