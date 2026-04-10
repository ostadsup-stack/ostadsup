-- Ensures RPC used by web (TeacherGroupDetail) exists if an older DB skipped
-- 20260411150000_student_coordinator_contacts.sql or PostgREST cache was stale.

create or replace function public.list_group_member_contacts_for_staff (p_group_id uuid)
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
begin
  me := auth.uid ();
  if me is null then
    raise exception 'not_authenticated';
  end if;

  if
    not (
      public.is_workspace_owner (public.group_workspace_id (p_group_id), me)
      or public.is_group_staff (p_group_id, me)
    )
  then
    raise exception 'forbidden';
  end if;

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
    and gm.role_in_group in ('student', 'coordinator');
end;
$$;

grant execute on function public.list_group_member_contacts_for_staff (uuid) to authenticated;
