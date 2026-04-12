-- Group wall posts: coordinators only (not plain students).
drop policy if exists posts_insert_group_member on public.posts;

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
      and exists (
        select 1
        from public.group_members gm
        where
          gm.group_id = g.id
          and gm.user_id = auth.uid ()
          and gm.status = 'active'
          and gm.role_in_group = 'coordinator'
      )
  )
);

-- Start DM with workspace owner or linked staff teacher.
create or replace function public.start_conversation_with_teacher (
  p_group_id uuid,
  p_teacher_id uuid,
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
  ctype text;
  conv_id uuid;
  r text;
  ok_teacher boolean;
begin
  if auth.uid () is null then
    raise exception 'not_authenticated';
  end if;
  if p_teacher_id is null or p_teacher_id = auth.uid () then
    raise exception 'invalid_teacher';
  end if;

  select g.workspace_id
  into wid
  from public.groups g
  where g.id = p_group_id;

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
  if r = 'teacher' then
    raise exception 'teacher_use_wall_or_reply';
  end if;

  ok_teacher :=
    exists (
      select 1
      from public.workspaces w
      where w.id = wid and w.owner_teacher_id = p_teacher_id
    )
    or exists (
      select 1
      from public.group_staff gs
      where
        gs.group_id = p_group_id
        and gs.teacher_id = p_teacher_id
        and gs.status = 'active'
    );

  if not ok_teacher then
    raise exception 'teacher_not_in_group_workspace';
  end if;

  ctype := case
    when r = 'coordinator' then 'teacher_coordinator'
    else 'teacher_student'
  end;

  insert into public.conversations (
    workspace_id,
    group_id,
    conversation_type,
    subject,
    created_by
  )
  values (wid, p_group_id, ctype, p_subject, auth.uid ())
  returning id into conv_id;

  insert into public.conversation_participants (
    conversation_id,
    user_id,
    participant_role
  )
  values (conv_id, auth.uid (), 'member'), (conv_id, p_teacher_id, 'member');

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

grant execute on function public.start_conversation_with_teacher (uuid, uuid, text, text, text) to authenticated;

-- Students need to list linked teachers on the group page.
drop policy if exists gs_select on public.group_staff;

create policy gs_select on public.group_staff for select using (
  teacher_id = auth.uid ()
  or public.is_workspace_owner (public.group_workspace_id (group_id), auth.uid ())
  or public.is_profile_admin (auth.uid ())
  or public.is_group_member (group_id, auth.uid ())
);
