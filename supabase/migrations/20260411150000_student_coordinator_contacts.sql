-- محادثة طالب ↔ منسق + إظهار بيانات التواصل (هاتف، واتساب، بريد تسجيل، رقم جامعي)

alter table public.conversations drop constraint if exists conversations_conversation_type_check;

alter table public.conversations
add constraint conversations_conversation_type_check check (
  conversation_type in (
    'teacher_student',
    'teacher_coordinator',
    'teacher_staff',
    'student_coordinator'
  )
);

-- طالب يفتح محادثة مع منسق في نفس الفوج
create or replace function public.start_conversation_with_coordinator (
  p_group_id uuid,
  p_coordinator_id uuid,
  p_message_kind text,
  p_subject text,
  p_body text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  wid uuid;
  conv_id uuid;
  r text;
begin
  if auth.uid () is null then
    raise exception 'not_authenticated';
  end if;
  if p_coordinator_id is null or p_coordinator_id = auth.uid () then
    raise exception 'invalid_coordinator';
  end if;

  select g.workspace_id
  into wid
  from public.groups g
  where
    g.id = p_group_id
    and g.status = 'active';

  if wid is null then
    raise exception 'bad_group';
  end if;

  select gm.role_in_group
  into r
  from public.group_members gm
  where
    gm.group_id = p_group_id
    and gm.user_id = auth.uid ()
    and gm.status = 'active';

  if r is null then
    raise exception 'not_member';
  end if;
  if r <> 'student' then
    raise exception 'only_students_message_coordinator';
  end if;

  if
    not exists (
      select 1
      from public.group_members gm
      where
        gm.group_id = p_group_id
        and gm.user_id = p_coordinator_id
        and gm.status = 'active'
        and gm.role_in_group = 'coordinator'
    )
  then
    raise exception 'peer_not_coordinator';
  end if;

  insert into public.conversations (
    workspace_id,
    group_id,
    conversation_type,
    subject,
    created_by
  )
  values (wid, p_group_id, 'student_coordinator', p_subject, auth.uid ())
  returning id into conv_id;

  insert into public.conversation_participants (
    conversation_id,
    user_id,
    participant_role
  )
  values (conv_id, auth.uid (), 'member'), (conv_id, p_coordinator_id, 'member');

  insert into public.messages (
    conversation_id,
    sender_id,
    message_kind,
    body
  )
  values (
    conv_id,
    auth.uid (),
    coalesce(nullif(trim(p_message_kind), ''), 'question'),
    p_body
  );

  return conv_id;
end;
$$;

grant execute on function public.start_conversation_with_coordinator (uuid, uuid, text, text, text) to authenticated;

-- منسق يفتح محادثة مع طالب في نفس الفوج
create or replace function public.start_conversation_with_student (
  p_group_id uuid,
  p_student_id uuid,
  p_message_kind text,
  p_subject text,
  p_body text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  wid uuid;
  conv_id uuid;
  r text;
begin
  if auth.uid () is null then
    raise exception 'not_authenticated';
  end if;
  if p_student_id is null or p_student_id = auth.uid () then
    raise exception 'invalid_student';
  end if;

  select g.workspace_id
  into wid
  from public.groups g
  where
    g.id = p_group_id
    and g.status = 'active';

  if wid is null then
    raise exception 'bad_group';
  end if;

  select gm.role_in_group
  into r
  from public.group_members gm
  where
    gm.group_id = p_group_id
    and gm.user_id = auth.uid ()
    and gm.status = 'active';

  if r is null then
    raise exception 'not_member';
  end if;
  if r <> 'coordinator' then
    raise exception 'only_coordinators_message_students';
  end if;

  if
    not exists (
      select 1
      from public.group_members gm
      where
        gm.group_id = p_group_id
        and gm.user_id = p_student_id
        and gm.status = 'active'
        and gm.role_in_group = 'student'
    )
  then
    raise exception 'peer_not_student';
  end if;

  insert into public.conversations (
    workspace_id,
    group_id,
    conversation_type,
    subject,
    created_by
  )
  values (wid, p_group_id, 'student_coordinator', p_subject, auth.uid ())
  returning id into conv_id;

  insert into public.conversation_participants (
    conversation_id,
    user_id,
    participant_role
  )
  values (conv_id, auth.uid (), 'member'), (conv_id, p_student_id, 'member');

  insert into public.messages (
    conversation_id,
    sender_id,
    message_kind,
    body
  )
  values (
    conv_id,
    auth.uid (),
    coalesce(nullif(trim(p_message_kind), ''), 'note'),
    p_body
  );

  return conv_id;
end;
$$;

grant execute on function public.start_conversation_with_student (uuid, uuid, text, text, text) to authenticated;

-- طالب يرى منسقي الفوج؛ منسق يرى طلبة الفوج — مع بريد تسجيل الحساب
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

-- مسؤول المساحة أو طاقم الفوج: جهات اتصال كل الطلبة والمنسقين
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
