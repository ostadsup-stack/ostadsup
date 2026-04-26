-- السماح للأستاذ/الطالب بفتح خيط دردشة مع مدير التطبيق (أقدم حساب admin)
create or replace function public.ensure_my_admin_chat_thread ()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_peer uuid := auth.uid ();
  v_admin uuid;
  v_thread uuid;
begin
  if v_peer is null then
    raise exception 'not authenticated';
  end if;

  if public.is_profile_admin (v_peer) then
    raise exception 'use admin messages from the admin console';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where
      p.id = v_peer
      and p.role in ('teacher', 'student')
  ) then
    raise exception 'only teachers and students can open this thread';
  end if;

  select p.id into v_admin
  from public.profiles p
  where
    p.role = 'admin'
  order by
    p.created_at asc
  limit 1;

  if v_admin is null then
    raise exception 'no application admin account';
  end if;

  select t.id into v_thread
  from public.admin_chat_threads t
  where
    t.admin_id = v_admin
    and t.peer_user_id = v_peer;

  if v_thread is not null then
    return v_thread;
  end if;

  insert into public.admin_chat_threads (admin_id, peer_user_id)
  values (v_admin, v_peer)
  returning id into v_thread;

  return v_thread;
end;
$$;

revoke all on function public.ensure_my_admin_chat_thread () from public;
grant execute on function public.ensure_my_admin_chat_thread () to authenticated;

comment on function public.ensure_my_admin_chat_thread () is
  'Returns the admin_chat thread for the current user with the oldest admin profile; creates the thread if missing.';
