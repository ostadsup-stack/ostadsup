-- متى اطّلع الـ peer (مثلاً أستاذ) على رد المدير في admin_chat
alter table public.admin_chat_threads
  add column if not exists peer_last_read_at timestamptz;

comment on column public.admin_chat_threads.peer_last_read_at is
  'آخر اطلاع للـ peer على أحداث الخيط; رسائل admin_id لاحقاً = غير مقروءة للمستخدم.';

create or replace function public.mark_admin_chat_peer_read (p_thread_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid () is null then
    raise exception 'not_authenticated';
  end if;
  update public.admin_chat_threads
  set
    peer_last_read_at = now ()
  where
    id = p_thread_id
    and peer_user_id = auth.uid ();
end;
$$;

revoke all on function public.mark_admin_chat_peer_read (uuid) from public;
grant execute on function public.mark_admin_chat_peer_read (uuid) to authenticated;

comment on function public.mark_admin_chat_peer_read (uuid) is
  'يستدعيه الطرف peer بعد فتح المحادثة مع المدير.';

-- عدد الخيوط التي فيها رد من المدير (admin_id) بلا اطلاع peer
create or replace function public.admin_chat_unread_from_admin_count_for_peer ()
returns integer
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((
    select (count (distinct t.id))::int
    from public.admin_chat_threads t
    where
      t.peer_user_id = auth.uid ()
      and exists (
        select 1
        from public.admin_chat_messages m
        where
          m.thread_id = t.id
          and m.sender_id = t.admin_id
          and (t.peer_last_read_at is null or m.created_at > t.peer_last_read_at)
      )
  ), 0);
$$;

revoke all on function public.admin_chat_unread_from_admin_count_for_peer () from public;
grant execute on function public.admin_chat_unread_from_admin_count_for_peer () to authenticated;

comment on function public.admin_chat_unread_from_admin_count_for_peer is
  'للـ peer: حالات جديدة من سطر المدير (إشعار الجرس).';
