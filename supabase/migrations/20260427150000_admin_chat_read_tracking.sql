-- تتبع رؤية المدير لخيوط دردشة admin_chat (لإظهار “غير مقروء” عند إرسال أستاذ/مستخدم)
alter table public.admin_chat_threads
  add column if not exists admin_last_read_at timestamptz;

comment on column public.admin_chat_threads.admin_last_read_at is
  'عند فتح المدير المحادثة: يُحدّث; الرسائل من peer بعد هذا الوقت تُعامل كغير مقروء.';

-- السماح للمدير بتحديث وضع القراءة (وأي ضبط مناسب) على خيوط الدردشة
create policy admin_threads_update_on on public.admin_chat_threads
for update
to authenticated
using (public.is_profile_admin (auth.uid ()))
with check (public.is_profile_admin (auth.uid ()));

-- قائمة معرّفات المستخدمين (peers) الذين بقيّت لهم رسائل بلا قراءة من المدير
create or replace function public.admin_chat_unread_peer_ids ()
returns setof uuid
language sql
security definer
set search_path = public
stable
as $$
  select distinct t.peer_user_id
  from public.admin_chat_threads t
  where
    public.is_profile_admin (auth.uid ())
    and exists (
      select 1
      from public.admin_chat_messages m
      where
        m.thread_id = t.id
        and m.sender_id = t.peer_user_id
        and (t.admin_last_read_at is null or m.created_at > t.admin_last_read_at)
    );
$$;

revoke all on function public.admin_chat_unread_peer_ids () from public;
grant execute on function public.admin_chat_unread_peer_ids () to authenticated;

comment on function public.admin_chat_unread_peer_ids is
  'للمدير: peers لديهم في خَيط ما رسالة من peer لم يُرَمِز اطلاع المدير عليها (admin_last_read_at).';
