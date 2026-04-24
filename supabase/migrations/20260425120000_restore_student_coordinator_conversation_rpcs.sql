-- Repair DBs where 20260411150000 was recorded but conversation_type / RPCs did not land.

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
