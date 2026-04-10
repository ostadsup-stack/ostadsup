-- Ensures RPC used by web (StudentGroupPage) exists if an older DB skipped
-- 20260411150000_student_coordinator_contacts.sql or PostgREST reported schema cache miss.

create or replace function public.list_group_visible_contacts (p_group_id uuid)
returns table (
  user_id uuid,
  full_name text,
  role_in_group text,
  phone text,
  whatsapp text,
  email text,
  student_number text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid;
  my_role text;
begin
  me := auth.uid ();
  if me is null then
    raise exception 'not_authenticated';
  end if;

  select gm.role_in_group
  into my_role
  from public.group_members gm
  where
    gm.group_id = p_group_id
    and gm.user_id = me
    and gm.status = 'active';

  if my_role is null then
    raise exception 'not_member';
  end if;

  if my_role = 'student' then
    return query
    select
      p.id,
      p.full_name::text,
      gm.role_in_group::text,
      p.phone,
      p.whatsapp,
      coalesce(au.email::text, ''::text) as email,
      gm.student_number::text
    from public.group_members gm
    join public.profiles p on p.id = gm.user_id
    left join auth.users au on au.id = gm.user_id
    where
      gm.group_id = p_group_id
      and gm.status = 'active'
      and gm.role_in_group = 'coordinator';
  elsif my_role = 'coordinator' then
    return query
    select
      p.id,
      p.full_name::text,
      gm.role_in_group::text,
      p.phone,
      p.whatsapp,
      coalesce(au.email::text, ''::text) as email,
      gm.student_number::text
    from public.group_members gm
    join public.profiles p on p.id = gm.user_id
    left join auth.users au on au.id = gm.user_id
    where
      gm.group_id = p_group_id
      and gm.status = 'active'
      and gm.role_in_group = 'student';
  end if;
end;
$$;

grant execute on function public.list_group_visible_contacts (uuid) to authenticated;
