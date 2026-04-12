-- قائمة صندوق محادثات الأستاذ: محادثات مرئية + غير مقروء + آخر مرسل + بيانات الفوج/المنسق

create or replace function public.teacher_inbox_list ()
returns table (
  conversation_id uuid,
  conversation_type text,
  group_id uuid,
  workspace_id uuid,
  subject text,
  conversation_created_at timestamptz,
  unread_count bigint,
  last_message_at timestamptz,
  last_sender_name text,
  last_sender_role text,
  last_message_kind text,
  last_incoming_message_kind text,
  group_name text,
  study_level text,
  accent_color text,
  coordinator_names text,
  has_admin_message boolean,
  last_teacher_peer_name text
)
language sql
stable
security definer
set search_path = public
as $$
  with uid as (
    select auth.uid () as id
  ),
  visible as (
    select
      c.id,
      c.workspace_id,
      c.group_id,
      c.conversation_type,
      c.subject,
      c.created_at
    from public.conversations c
    where
      exists (
        select 1
        from public.workspaces w
        where
          w.id = c.workspace_id
          and w.owner_teacher_id = (select id from uid)
      )
      or (
        c.conversation_type = 'teacher_staff'
        and public.is_group_staff (c.group_id, (select id from uid))
      )
  ),
  unread as (
    select
      m.conversation_id,
      count(*) filter (
        where
          m.read_at is null
          and m.sender_id <> (select id from uid)
      )::bigint as unread_count
    from public.messages m
    inner join visible v on v.id = m.conversation_id
    group by m.conversation_id
  ),
  last_msg as (
    select distinct on (m.conversation_id)
      m.conversation_id,
      m.created_at as msg_at,
      coalesce(nullif(trim(p.full_name), ''), 'مستخدم') as sender_name,
      p.role::text as sender_role,
      m.message_kind
    from public.messages m
    inner join visible v on v.id = m.conversation_id
    inner join public.profiles p on p.id = m.sender_id
    order by m.conversation_id, m.created_at desc
  ),
  last_incoming as (
    select distinct on (m.conversation_id)
      m.conversation_id,
      m.message_kind as incoming_kind
    from public.messages m
    inner join visible v on v.id = m.conversation_id
    where
      m.sender_id <> (select id from uid)
    order by m.conversation_id, m.created_at desc
  ),
  last_teacher_peer as (
    select distinct on (m.conversation_id)
      m.conversation_id,
      coalesce(nullif(trim(p.full_name), ''), 'أستاذ') as teacher_name
    from public.messages m
    inner join visible v on v.id = m.conversation_id
    inner join public.profiles p on p.id = m.sender_id
    where
      m.sender_id <> (select id from uid)
      and p.role = 'teacher'
    order by m.conversation_id, m.created_at desc
  ),
  admin_touch as (
    select distinct m.conversation_id
    from public.messages m
    inner join public.profiles p on p.id = m.sender_id
    where
      p.role = 'admin'
      and m.conversation_id in (select id from visible)
  ),
  coord_names as (
    select
      gm.group_id,
      string_agg(
        coalesce(nullif(trim(gm.display_name), ''), nullif(trim(pf.full_name), ''), 'منسق'),
        '، '
        order by gm.user_id
      ) as names
    from public.group_members gm
    inner join public.profiles pf on pf.id = gm.user_id
    where
      gm.role_in_group = 'coordinator'
      and coalesce(gm.status, 'active') = 'active'
    group by
      gm.group_id
  )
  select
    v.id,
    v.conversation_type,
    v.group_id,
    v.workspace_id,
    v.subject,
    v.created_at,
    coalesce(u.unread_count, 0::bigint),
    lm.msg_at,
    lm.sender_name,
    lm.sender_role,
    lm.message_kind,
    li.incoming_kind,
    g.group_name,
    g.study_level::text,
    g.accent_color,
    cn.names,
    exists (select 1 from admin_touch a where a.conversation_id = v.id),
    ltp.teacher_name
  from visible v
  left join unread u on u.conversation_id = v.id
  left join last_msg lm on lm.conversation_id = v.id
  left join last_incoming li on li.conversation_id = v.id
  left join last_teacher_peer ltp on ltp.conversation_id = v.id
  left join public.groups g on g.id = v.group_id
  left join coord_names cn on cn.group_id = v.group_id
  order by lm.msg_at desc nulls last, v.created_at desc;
$$;

grant execute on function public.teacher_inbox_list () to authenticated;

comment on function public.teacher_inbox_list () is
'Inbox rows for workspace owner and linked staff (teacher_staff); includes unread counts and preview fields for UI.';
