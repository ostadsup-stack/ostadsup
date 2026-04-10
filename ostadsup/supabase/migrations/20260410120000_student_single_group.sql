-- One active student group per user; optional self-service leave.

create or replace function public.join_group_by_code (
  p_code text,
  p_display_name text,
  p_student_number text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  gid uuid;
begin
  if auth.uid () is null then
    raise exception 'not_authenticated';
  end if;
  if p_display_name is null or length(trim(p_display_name)) = 0 then
    raise exception 'display_name_required';
  end if;

  select id into gid
  from public.groups
  where join_code = upper(trim(p_code))
    and status = 'active';

  if gid is null then
    raise exception 'invalid_join_code';
  end if;

  if exists (
    select 1
    from public.group_members gm
    where
      gm.user_id = auth.uid ()
      and gm.status = 'active'
      and gm.role_in_group = 'student'
      and gm.group_id is distinct from gid
  ) then
    raise exception 'student_already_in_another_group';
  end if;

  insert into public.group_members (
    group_id,
    user_id,
    role_in_group,
    display_name,
    student_number
  )
  values (
    gid,
    auth.uid (),
    'student',
    trim(p_display_name),
    nullif(trim(p_student_number), '')
  )
  on conflict (group_id, user_id) do update
  set
    display_name = excluded.display_name,
    student_number = excluded.student_number,
    status = 'active',
    role_in_group = case
      when public.group_members.role_in_group = 'coordinator' then 'coordinator'
      else 'student'
    end;

  return gid;
end;
$$;

create or replace function public.join_group_by_student_token (
  p_token text,
  p_display_name text,
  p_student_number text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  gid uuid;
begin
  if auth.uid () is null then
    raise exception 'not_authenticated';
  end if;
  if p_display_name is null or length(trim(p_display_name)) = 0 then
    raise exception 'display_name_required';
  end if;

  select t.group_id into gid
  from public.group_invite_tokens t
  join public.groups g on g.id = t.group_id
  where
    t.student_join_secret = lower(trim(p_token))
    and g.status = 'active';

  if gid is null then
    raise exception 'invalid_join_token';
  end if;

  if exists (
    select 1
    from public.group_members gm
    where
      gm.user_id = auth.uid ()
      and gm.status = 'active'
      and gm.role_in_group = 'student'
      and gm.group_id is distinct from gid
  ) then
    raise exception 'student_already_in_another_group';
  end if;

  insert into public.group_members (
    group_id,
    user_id,
    role_in_group,
    display_name,
    student_number
  )
  values (
    gid,
    auth.uid (),
    'student',
    trim(p_display_name),
    nullif(trim(p_student_number), '')
  )
  on conflict (group_id, user_id) do update
  set
    display_name = excluded.display_name,
    student_number = excluded.student_number,
    status = 'active',
    role_in_group = case
      when public.group_members.role_in_group = 'coordinator' then 'coordinator'
      else 'student'
    end;

  return gid;
end;
$$;

create or replace function public.leave_student_group (p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  if auth.uid () is null then
    raise exception 'not_authenticated';
  end if;

  update public.group_members
  set status = 'left'
  where
    group_id = p_group_id
    and user_id = auth.uid ()
    and role_in_group = 'student'
    and status = 'active';

  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'not_an_active_student_in_group';
  end if;
end;
$$;

grant execute on function public.leave_student_group (uuid) to authenticated;
