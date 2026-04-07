-- =============================================================================
-- Ostadi — أفواج متعددة الأساتذة + أعمدة الفوج (للصق في Supabase SQL Editor)
-- =============================================================================
-- آمن لإعادة التنفيذ على مشروع موجود: IF NOT EXISTS / DROP IF EXISTS حيث يلزم.
-- بعد التنفيذ: Dashboard → Settings → API → Reload schema (أو أعد نشر المشروع).
--
-- يفترض وجود: profiles, workspaces, groups (أساسي), group_members, conversations,
-- conversation_participants, messages, وجداول المحتوى (posts, materials, …)
-- والدوال: group_workspace_id, is_workspace_owner, user_participates_in_conversation,
-- conversation_workspace_id (كما في هجرات Ostadi الأولى).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- ربط pgcrypto: الدالة الأصلية في extensions؛ دوال Ostadi تضبط غالباً search_path = public
-- فيفشل gen_random_bytes. الغلاف في public يحل ذلك دون تعديل كل استدعاء.
-- ---------------------------------------------------------------------------
create extension if not exists pgcrypto with schema extensions;

create or replace function public.gen_random_bytes (len int)
returns bytea
language sql
immutable
parallel safe
security invoker
set search_path = public, extensions
as $$
  select extensions.gen_random_bytes (len);
$$;

comment on function public.gen_random_bytes (int) is
  'Ostadi: يفوّض إلى extensions.gen_random_bytes عند search_path = public';

-- (0) أعمدة الأفواج الناقصة على groups + فهرس cohort
alter table public.groups
  add column if not exists study_level text,
  add column if not exists cohort_official_code text,
  add column if not exists cohort_sequence int,
  add column if not exists cohort_suffix text;

update public.groups
set study_level = coalesce(study_level, 'licence')
where study_level is null;

alter table public.groups
  alter column study_level set default 'licence',
  alter column study_level set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'groups_study_level_check'
      and conrelid = 'public.groups'::regclass
  ) then
    alter table public.groups
      add constraint groups_study_level_check
      check (study_level in ('licence', 'master', 'doctorate'));
  end if;
end $$;

create unique index if not exists groups_workspace_cohort_official_code_uidx
  on public.groups (workspace_id, cohort_official_code)
  where cohort_official_code is not null;

-- ---------------------------------------------------------------------------
-- Multi-teacher cohorts: staff links, invite tokens table (RLS), schedule/member/staff messaging RLS, admin helpers
-- ---------------------------------------------------------------------------
-- Invite tokens (not on groups row — students can SELECT groups as members)
-- ---------------------------------------------------------------------------
create table if not exists public.group_invite_tokens (
  group_id uuid primary key references public.groups (id) on delete cascade,
  student_join_secret text not null unique,
  teacher_link_secret text not null unique,
  created_at timestamptz not null default now ()
);

create index if not exists group_invite_tokens_student_secret_idx on public.group_invite_tokens (student_join_secret);

create index if not exists group_invite_tokens_teacher_secret_idx on public.group_invite_tokens (teacher_link_secret);

insert into public.group_invite_tokens (group_id, student_join_secret, teacher_link_secret)
select
  g.id,
  encode(gen_random_bytes (24), 'hex'),
  encode(gen_random_bytes (24), 'hex')
from public.groups g
where
  not exists (
    select 1
    from public.group_invite_tokens t
    where t.group_id = g.id
  );

create or replace function public.trg_insert_group_invite_tokens ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.group_invite_tokens (group_id, student_join_secret, teacher_link_secret)
  values (
    new.id,
    encode(gen_random_bytes (24), 'hex'),
    encode(gen_random_bytes (24), 'hex')
  );
  return new;
end;
$$;

drop trigger if exists trg_groups_invite_tokens on public.groups;

create trigger trg_groups_invite_tokens
after insert on public.groups for each row
execute function public.trg_insert_group_invite_tokens ();

alter table public.group_invite_tokens enable row level security;

-- ---------------------------------------------------------------------------
-- Staff links (linked teachers, not group_members)
-- ---------------------------------------------------------------------------
create table if not exists public.group_staff (
  id uuid primary key default gen_random_uuid (),
  group_id uuid not null references public.groups (id) on delete cascade,
  teacher_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'revoked')),
  invited_by uuid references public.profiles (id),
  created_at timestamptz not null default now (),
  unique (group_id, teacher_id)
);

create index if not exists group_staff_teacher_id_idx on public.group_staff (teacher_id);

create index if not exists group_staff_group_id_idx on public.group_staff (group_id);

alter table public.group_staff enable row level security;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.is_profile_admin (uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = uid and p.role = 'admin'
  );
$$;

grant execute on function public.is_profile_admin (uuid) to authenticated;

create or replace function public.is_group_staff (gid uuid, uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_workspace_owner (public.group_workspace_id (gid), uid)
    or exists (
      select 1
      from public.group_staff gs
      where
        gs.group_id = gid
        and gs.teacher_id = uid
        and gs.status = 'active'
    );
$$;

grant execute on function public.is_group_staff (uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Conversations: teacher_staff (one per group)
-- ---------------------------------------------------------------------------
alter table public.conversations drop constraint if exists conversations_conversation_type_check;

alter table public.conversations
add constraint conversations_conversation_type_check check (
  conversation_type in ('teacher_student', 'teacher_coordinator', 'teacher_staff')
);

create unique index if not exists conversations_one_staff_per_group_uidx
  on public.conversations (group_id)
  where conversation_type = 'teacher_staff';

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------
create or replace function public.get_group_invite_tokens (p_group_id uuid)
returns table (
  student_join_secret text,
  teacher_link_secret text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid () is null then
    raise exception 'not_authenticated';
  end if;
  if not public.is_group_staff (p_group_id, auth.uid ()) then
    raise exception 'forbidden';
  end if;
  return query
  select t.student_join_secret, t.teacher_link_secret
  from public.group_invite_tokens t
  where t.group_id = p_group_id;
end;
$$;

grant execute on function public.get_group_invite_tokens (uuid) to authenticated;

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

grant execute on function public.join_group_by_student_token (text, text, text) to authenticated;

create or replace function public.redeem_teacher_group_link (p_secret text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  gid uuid;
  wid uuid;
  uid uuid;
  pr text;
begin
  uid := auth.uid ();
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  select p.role into pr
  from public.profiles p
  where p.id = uid;

  if pr is null or pr not in ('teacher', 'admin') then
    raise exception 'teachers_only';
  end if;

  select t.group_id into gid
  from public.group_invite_tokens t
  join public.groups g on g.id = t.group_id
  where
    t.teacher_link_secret = lower(trim(p_secret))
    and g.status = 'active';

  if gid is null then
    raise exception 'invalid_teacher_link';
  end if;

  wid := public.group_workspace_id (gid);
  if public.is_workspace_owner (wid, uid) then
    raise exception 'already_owner';
  end if;

  if
    exists (
      select 1
      from public.group_staff gs
      where gs.group_id = gid and gs.teacher_id = uid and gs.status = 'active'
    )
  then
    return gid;
  end if;

  insert into public.group_staff (group_id, teacher_id, invited_by, status)
  values (gid, uid, uid, 'active');

  return gid;
end;
$$;

grant execute on function public.redeem_teacher_group_link (text) to authenticated;

create or replace function public.rotate_teacher_link_secret (p_group_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  wid uuid;
  new_secret text;
begin
  if auth.uid () is null then
    raise exception 'not_authenticated';
  end if;
  wid := public.group_workspace_id (p_group_id);
  if not public.is_workspace_owner (wid, auth.uid ()) then
    raise exception 'forbidden';
  end if;

  new_secret := encode(gen_random_bytes (24), 'hex');

  update public.group_invite_tokens t
  set
    teacher_link_secret = new_secret
  where t.group_id = p_group_id
  returning teacher_link_secret into new_secret;

  return new_secret;
end;
$$;

grant execute on function public.rotate_teacher_link_secret (uuid) to authenticated;

create or replace function public.post_teacher_staff_message (p_group_id uuid, p_body text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  wid uuid;
  conv_id uuid;
  uid uuid;
begin
  uid := auth.uid ();
  if uid is null then
    raise exception 'not_authenticated';
  end if;
  if not public.is_group_staff (p_group_id, uid) then
    raise exception 'forbidden';
  end if;
  if p_body is null or length(trim(p_body)) = 0 then
    raise exception 'empty_body';
  end if;

  select g.workspace_id into wid
  from public.groups g
  where
    g.id = p_group_id
    and g.status = 'active';

  if wid is null then
    raise exception 'bad_group';
  end if;

  select c.id into conv_id
  from public.conversations c
  where
    c.group_id = p_group_id
    and c.conversation_type = 'teacher_staff'
  limit 1;

  if conv_id is null then
    insert into public.conversations (
      workspace_id,
      group_id,
      conversation_type,
      subject,
      created_by
    )
    values (wid, p_group_id, 'teacher_staff', 'طاقم التدريس', uid)
    returning id into conv_id;
  end if;

  insert into public.messages (
    conversation_id,
    sender_id,
    message_kind,
    body
  )
  values (conv_id, uid, 'staff', trim(p_body));
end;
$$;

grant execute on function public.post_teacher_staff_message (uuid, text) to authenticated;

create or replace function public.admin_suspend_group (p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid () is null then
    raise exception 'not_authenticated';
  end if;
  if not public.is_profile_admin (auth.uid ()) then
    raise exception 'forbidden';
  end if;

  update public.groups
  set
    status = 'archived'
  where id = p_group_id;
end;
$$;

grant execute on function public.admin_suspend_group (uuid) to authenticated;

-- set_group_member_role: owner OR staff
create or replace function public.set_group_member_role (
  p_group_id uuid,
  p_user_id uuid,
  p_role text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid () is null then
    raise exception 'not_authenticated';
  end if;
  if not public.is_group_staff (p_group_id, auth.uid ()) then
    raise exception 'forbidden';
  end if;
  if p_role not in ('student', 'coordinator') then
    raise exception 'invalid_role';
  end if;
  update public.group_members
  set role_in_group = p_role
  where group_id = p_group_id and user_id = p_user_id;
end;
$$;

grant execute on function public.set_group_member_role (uuid, uuid, text) to authenticated;

-- user_can_read_messages: staff threads
create or replace function public.user_can_read_messages_in_conversation (p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1
      from public.conversation_participants p
      where
        p.conversation_id = p_conversation_id
        and p.user_id = (select auth.uid ())
    )
    or exists (
      select 1
      from public.conversations c
      where
        c.id = p_conversation_id
        and exists (
          select 1
          from public.workspaces w
          where
            w.id = c.workspace_id
            and w.owner_teacher_id = (select auth.uid ())
        )
    )
    or exists (
      select 1
      from public.conversations c
      where
        c.id = p_conversation_id
        and c.conversation_type = 'teacher_staff'
        and public.is_group_staff (c.group_id, (select auth.uid ()))
    );
$$;

grant execute on function public.user_can_read_messages_in_conversation (uuid) to authenticated;

-- mark read: staff can mark staff thread
create or replace function public.mark_conversation_messages_read (p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  wid uuid;
  uid uuid;
  g_teacher_staff boolean;
  gid uuid;
begin
  uid := auth.uid ();
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  select c.workspace_id, c.conversation_type = 'teacher_staff', c.group_id
  into wid, g_teacher_staff, gid
  from public.conversations c
  where c.id = p_conversation_id;

  if wid is null then
    raise exception 'not_found';
  end if;

  if
    not exists (
      select 1
      from public.workspaces w
      where w.id = wid and w.owner_teacher_id = uid
    )
    and not exists (
      select 1
      from public.conversation_participants p
      where p.conversation_id = p_conversation_id and p.user_id = uid
    )
    and not (
      g_teacher_staff
      and public.is_group_staff (gid, uid)
    )
  then
    raise exception 'forbidden';
  end if;

  update public.messages m
  set
    read_at = now ()
  where
    m.conversation_id = p_conversation_id
    and m.sender_id <> uid
    and m.read_at is null;
end;
$$;

grant execute on function public.mark_conversation_messages_read (uuid) to authenticated;

-- Teacher group list: owned ∪ linked + is_owner flag (DROP يضمن إعادة الإنشاء إن تغيّر نوع الإرجاع)
drop function if exists public.teacher_group_list_summaries (timestamptz, timestamptz);

create or replace function public.teacher_group_list_summaries (
  p_today_start timestamptz,
  p_today_end timestamptz
)
returns table (
  group_id uuid,
  group_name text,
  study_level text,
  cohort_official_code text,
  academic_year text,
  student_count bigint,
  unread_count bigint,
  today_event_subject text,
  today_event_starts_at timestamptz,
  today_event_ends_at timestamptz,
  today_event_mode text,
  join_code text,
  is_owner boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    g.id,
    g.group_name,
    g.study_level,
    g.cohort_official_code,
    g.academic_year,
    coalesce(
      (
        select count(*)::bigint
        from public.group_members gm
        where
          gm.group_id = g.id
          and gm.role_in_group = 'student'
          and gm.status = 'active'
      ),
      0
    ),
    coalesce(
      (
        select count(*)::bigint
        from public.messages m
        inner join public.conversations c on c.id = m.conversation_id
        where
          c.group_id = g.id
          and m.sender_id <> (select auth.uid ())
          and m.read_at is null
      ),
      0
    ),
    te.subject_name,
    te.starts_at,
    te.ends_at,
    te.mode::text,
    g.join_code,
    exists (
      select 1
      from public.workspaces ow
      where ow.id = g.workspace_id and ow.owner_teacher_id = (select auth.uid ())
    )
  from public.groups g
  left join lateral (
    select
      se.subject_name,
      se.starts_at,
      se.ends_at,
      se.mode
    from public.schedule_events se
    where
      se.group_id = g.id
      and se.status = 'planned'
      and se.starts_at < p_today_end
      and se.ends_at > p_today_start
    order by se.starts_at asc
    limit 1
  ) te on true
  where
    g.status = 'active'
    and (
      exists (
        select 1
        from public.workspaces w
        where w.id = g.workspace_id and w.owner_teacher_id = (select auth.uid ())
      )
      or exists (
        select 1
        from public.group_staff gs
        where
          gs.group_id = g.id
          and gs.teacher_id = (select auth.uid ())
          and gs.status = 'active'
      )
    )
  order by g.created_at desc;
$$;

grant execute on function public.teacher_group_list_summaries (timestamptz, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS: drop & recreate affected policies
-- ---------------------------------------------------------------------------
drop policy if exists git_select_staff on public.group_invite_tokens;

create policy git_select_staff on public.group_invite_tokens for select using (
  public.is_group_staff (group_id, auth.uid ())
  or public.is_profile_admin (auth.uid ())
);

-- no insert/update/delete for authenticated on tokens — only triggers & definer RPCs

drop policy if exists gs_select on public.group_staff;

create policy gs_select on public.group_staff for select using (
  teacher_id = auth.uid ()
  or public.is_workspace_owner (public.group_workspace_id (group_id), auth.uid ())
  or public.is_profile_admin (auth.uid ())
);

drop policy if exists sched_select on public.schedule_events;

drop policy if exists sched_write_teacher on public.schedule_events;

drop policy if exists sched_mutate_teacher on public.schedule_events;

drop policy if exists sched_delete_teacher on public.schedule_events;

create policy sched_select on public.schedule_events for select using (
  public.is_group_member (group_id, auth.uid ())
  or public.is_group_staff (group_id, auth.uid ())
  or public.is_profile_admin (auth.uid ())
);

create policy sched_write_teacher on public.schedule_events for insert
with check (
  public.is_group_staff (group_id, auth.uid ())
  and workspace_id = public.group_workspace_id (group_id)
  and created_by = auth.uid ()
);

create policy sched_mutate_teacher on public.schedule_events
for update
using (public.is_group_staff (group_id, auth.uid ()));

create policy sched_delete_teacher on public.schedule_events for delete using (
  public.is_group_staff (group_id, auth.uid ())
);

drop policy if exists gm_select on public.group_members;

drop policy if exists gm_insert_teacher on public.group_members;

drop policy if exists gm_update_teacher on public.group_members;

drop policy if exists gm_delete_teacher on public.group_members;

create policy gm_select on public.group_members for select using (
  public.is_workspace_owner (public.group_workspace_id (group_id), auth.uid ())
  or public.is_group_member (group_id, auth.uid ())
  or public.is_group_staff (group_id, auth.uid ())
  or public.is_profile_admin (auth.uid ())
);

create policy gm_insert_teacher on public.group_members for insert
with check (public.is_group_staff (group_id, auth.uid ()));

create policy gm_update_teacher on public.group_members
for update
using (public.is_group_staff (group_id, auth.uid ()));

create policy gm_delete_teacher on public.group_members for delete using (
  public.is_group_staff (group_id, auth.uid ())
);

drop policy if exists groups_select on public.groups;

create policy groups_select on public.groups for select using (
  public.is_workspace_owner (workspace_id, auth.uid ())
  or public.is_group_member (id, auth.uid ())
  or public.is_group_staff (id, auth.uid ())
  or public.is_profile_admin (auth.uid ())
);

drop policy if exists groups_update_teacher on public.groups;

create policy groups_update_teacher on public.groups
for update
using (
  public.is_workspace_owner (workspace_id, auth.uid ())
  or public.is_profile_admin (auth.uid ())
);

drop policy if exists conv_select on public.conversations;

drop policy if exists conv_update_teacher on public.conversations;

create policy conv_select on public.conversations for select using (
  public.user_participates_in_conversation (id)
  or public.is_workspace_owner (workspace_id, auth.uid ())
  or (
    conversation_type = 'teacher_staff'
    and public.is_group_staff (group_id, auth.uid ())
  )
  or public.is_profile_admin (auth.uid ())
);

create policy conv_update_teacher on public.conversations
for update
using (
  public.is_workspace_owner (workspace_id, auth.uid ())
  or (
    conversation_type = 'teacher_staff'
    and public.is_group_staff (group_id, auth.uid ())
  )
  or public.is_profile_admin (auth.uid ())
);

drop policy if exists cp_select on public.conversation_participants;

create policy cp_select on public.conversation_participants for select using (
  user_id = auth.uid ()
  or public.is_workspace_owner (
    public.conversation_workspace_id (conversation_id),
    auth.uid ()
  )
  or exists (
    select 1
    from public.conversations c
    where
      c.id = conversation_participants.conversation_id
      and c.conversation_type = 'teacher_staff'
      and public.is_group_staff (c.group_id, auth.uid ())
  )
  or public.is_profile_admin (auth.uid ())
);

drop policy if exists msg_insert on public.messages;

create policy msg_insert on public.messages for insert
with check (
  sender_id = auth.uid ()
  and (
    exists (
      select 1
      from public.conversation_participants p
      where
        p.conversation_id = messages.conversation_id
        and p.user_id = auth.uid ()
    )
    or exists (
      select 1
      from public.conversations c
      where
        c.id = messages.conversation_id
        and c.conversation_type = 'teacher_staff'
        and public.is_group_staff (c.group_id, auth.uid ())
    )
  )
);

drop policy if exists mat_select on public.materials;

drop policy if exists mat_write_teacher on public.materials;

drop policy if exists mat_update_teacher on public.materials;

drop policy if exists mat_delete_teacher on public.materials;

create policy mat_select on public.materials for select using (
  public.is_group_member (group_id, auth.uid ())
  or public.is_workspace_owner (workspace_id, auth.uid ())
  or public.is_group_staff (group_id, auth.uid ())
  or public.is_profile_admin (auth.uid ())
);

create policy mat_write_teacher on public.materials for insert
with check (
  public.is_group_staff (group_id, auth.uid ())
  and workspace_id = public.group_workspace_id (group_id)
  and created_by = auth.uid ()
);

create policy mat_update_teacher on public.materials
for update
using (public.is_group_staff (group_id, auth.uid ()));

create policy mat_delete_teacher on public.materials for delete using (
  public.is_group_staff (group_id, auth.uid ())
);

drop policy if exists mp_select on public.material_parts;

drop policy if exists mp_write_teacher on public.material_parts;

create policy mp_select on public.material_parts for select using (
  exists (
    select 1
    from public.materials m
    where
      m.id = material_parts.material_id
      and (
        public.is_group_member (m.group_id, auth.uid ())
        or public.is_workspace_owner (m.workspace_id, auth.uid ())
        or public.is_group_staff (m.group_id, auth.uid ())
        or public.is_profile_admin (auth.uid ())
      )
  )
);

create policy mp_write_teacher on public.material_parts for all using (
  exists (
    select 1
    from public.materials m
    where
      m.id = material_parts.material_id
      and public.is_group_staff (m.group_id, auth.uid ())
  )
)
with check (
  exists (
    select 1
    from public.materials m
    where
      m.id = material_parts.material_id
      and public.is_group_staff (m.group_id, auth.uid ())
  )
);

drop policy if exists posts_select on public.posts;

drop policy if exists posts_insert_teacher on public.posts;

drop policy if exists posts_update_teacher on public.posts;

drop policy if exists posts_delete_teacher on public.posts;

create policy posts_select on public.posts for select using (
  deleted_at is null
  and (
    (
      scope = 'group'
      and (
        public.is_group_member (group_id, auth.uid ())
        or public.is_group_staff (group_id, auth.uid ())
      )
    )
    or (
      scope = 'workspace'
      and public.user_in_workspace (workspace_id, auth.uid ())
    )
  )
);

create policy posts_insert_teacher on public.posts for insert
with check (
  author_id = auth.uid ()
  and public.is_workspace_owner (workspace_id, auth.uid ())
);

create policy posts_insert_group_staff on public.posts for insert
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
      and public.is_group_staff (g.id, auth.uid ())
  )
);

create policy posts_update_teacher on public.posts
for update
using (
  (
    public.is_workspace_owner (workspace_id, auth.uid ())
    and author_id = auth.uid ()
  )
  or (
    public.is_group_staff (group_id, auth.uid ())
    and author_id = auth.uid ()
  )
);

create policy posts_delete_teacher on public.posts for delete using (
  public.is_workspace_owner (workspace_id, auth.uid ())
  or (
    group_id is not null
    and public.is_group_staff (group_id, auth.uid ())
    and author_id = auth.uid ()
  )
);

-- =============================================================================
-- انتهى. من لوحة Supabase: Settings → API → Reload schema
-- =============================================================================
