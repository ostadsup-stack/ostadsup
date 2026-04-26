-- المدير: عرض/إنشاء/تعديل/حذف المنشورات + دردشة مبسطة (مدير ↔ مستخدم)

-- ---------------------------------------------------------------------------
-- posts: سياسات إضافية للمدير (لا تُلغي سياسات الأستاذ — تُجمَّع بـ OR)
-- ---------------------------------------------------------------------------
drop policy if exists posts_select_admin on public.posts;
drop policy if exists posts_insert_admin on public.posts;
drop policy if exists posts_update_admin on public.posts;
drop policy if exists posts_delete_admin on public.posts;

create policy posts_select_admin on public.posts for select using (public.is_profile_admin (auth.uid ()));

create policy posts_insert_admin on public.posts
for insert
with check (
  public.is_profile_admin (auth.uid ())
  and author_id = auth.uid ()
  and (
    (
      scope = 'workspace'
      and group_id is null
      and exists (select 1 from public.workspaces w where w.id = workspace_id)
    )
    or (
      scope = 'group'
      and group_id is not null
      and exists (
        select 1
        from public.groups g
        where
          g.id = group_id
          and g.workspace_id = workspace_id
      )
    )
  )
);

create policy posts_update_admin on public.posts
for update
using (public.is_profile_admin (auth.uid ()))
with check (true);

create policy posts_delete_admin on public.posts for delete using (public.is_profile_admin (auth.uid ()));

-- ---------------------------------------------------------------------------
-- admin_chat: محادثة مبسطة (خيط لكل زوج: مدير + مستخدم)
-- ---------------------------------------------------------------------------
create table if not exists public.admin_chat_threads (
  id uuid primary key default gen_random_uuid (),
  admin_id uuid not null references public.profiles (id) on delete cascade,
  peer_user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now (),
  constraint admin_chat_threads_distinct_admin_peer check (admin_id <> peer_user_id),
  constraint admin_chat_threads_unique_pair unique (admin_id, peer_user_id)
);

create table if not exists public.admin_chat_messages (
  id uuid primary key default gen_random_uuid (),
  thread_id uuid not null references public.admin_chat_threads (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now (),
  constraint admin_chat_messages_body_nonempty check (length (trim (body)) > 0)
);

create index if not exists admin_chat_messages_thread_created_idx
  on public.admin_chat_messages (thread_id, created_at);

-- مزامنة updated_at عند وصول رسالة
create or replace function public.trg_admin_chat_bump_thread ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.admin_chat_threads
  set
    updated_at = now()
  where
    id = new.thread_id;
  return new;
end;
$$;

drop trigger if exists trg_admin_chat_messages_bump on public.admin_chat_messages;

create trigger trg_admin_chat_messages_bump
after insert on public.admin_chat_messages for each row
execute procedure public.trg_admin_chat_bump_thread ();

alter table public.admin_chat_threads enable row level security;
alter table public.admin_chat_messages enable row level security;

-- الخيوط: المشاركان أو المدير (للاطلاع)
create policy admin_threads_select on public.admin_chat_threads for
select
using (auth.uid () in (admin_id, peer_user_id) or public.is_profile_admin (auth.uid ()));

create policy admin_threads_insert on public.admin_chat_threads for
insert
with check (
  public.is_profile_admin (auth.uid ())
  and admin_id = auth.uid ()
);

-- الرسائل: المدير يرى كل شيء؛ المستخدم يرى عند المشاركة في الخيط
drop policy if exists admin_msg_select on public.admin_chat_messages;
drop policy if exists admin_msg_insert on public.admin_chat_messages;
drop policy if exists admin_msg_update on public.admin_chat_messages;
drop policy if exists admin_msg_delete on public.admin_chat_messages;

create policy admin_msg_select on public.admin_chat_messages for
select
using (
  public.is_profile_admin (auth.uid ())
  or exists (
    select 1
    from public.admin_chat_threads t
    where
      t.id = admin_chat_messages.thread_id
      and auth.uid () in (t.admin_id, t.peer_user_id)
  )
);

-- الإرسال: فقط لمن يكون طرفاً في الخيط
create policy admin_msg_insert on public.admin_chat_messages for
insert
with check (
  sender_id = auth.uid ()
  and length (trim (body)) > 0
  and exists (
    select 1
    from public.admin_chat_threads t
    where
      t.id = admin_chat_messages.thread_id
      and auth.uid () in (t.admin_id, t.peer_user_id)
  )
);

-- التحديث/الحذف: المدير فقط (للتعديل الاستثنائي)
create policy admin_msg_update on public.admin_chat_messages
for update
using (public.is_profile_admin (auth.uid ()))
with check (true);

create policy admin_msg_delete on public.admin_chat_messages
for delete
using (public.is_profile_admin (auth.uid ()));
