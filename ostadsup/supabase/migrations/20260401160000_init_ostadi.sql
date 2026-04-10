-- Ostadi: profiles, workspaces, groups, content, messaging, notifications
-- Apply in Supabase SQL Editor or: supabase db push

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  role text not null default 'student' check (role in ('teacher', 'student', 'admin')),
  avatar_url text,
  phone text,
  whatsapp text,
  bio text,
  office_hours text,
  specialty text,
  social_links jsonb not null default '{}'::jsonb,
  cv_path text,
  status text not null default 'active' check (status in ('active', 'blocked')),
  created_at timestamptz not null default now()
);

create table public.workspaces (
  id uuid primary key default gen_random_uuid (),
  owner_teacher_id uuid not null references public.profiles (id) on delete cascade,
  display_name text not null,
  slug text not null unique,
  created_at timestamptz not null default now(),
  status text not null default 'active' check (status in ('active', 'suspended'))
);

create table public.groups (
  id uuid primary key default gen_random_uuid (),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  group_name text not null,
  academic_year text,
  university text,
  faculty text,
  subject_name text,
  coordinator_user_id uuid references public.profiles (id),
  whatsapp_link text,
  join_code text not null unique,
  study_level text not null default 'licence' check (
    study_level in ('licence', 'master', 'doctorate')
  ),
  cohort_official_code text,
  cohort_sequence int,
  cohort_suffix text,
  created_at timestamptz not null default now(),
  status text not null default 'active' check (status in ('active', 'archived'))
);

create unique index groups_workspace_cohort_official_code_uidx
  on public.groups (workspace_id, cohort_official_code)
  where cohort_official_code is not null;

create table public.group_members (
  id uuid primary key default gen_random_uuid (),
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role_in_group text not null default 'student' check (
    role_in_group in ('teacher', 'coordinator', 'student')
  ),
  student_number text,
  display_name text,
  joined_at timestamptz not null default now(),
  status text not null default 'active' check (status in ('active', 'left', 'blocked')),
  unique (group_id, user_id)
);

create table public.posts (
  id uuid primary key default gen_random_uuid (),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  group_id uuid references public.groups (id) on delete cascade,
  author_id uuid not null references public.profiles (id),
  scope text not null check (scope in ('group', 'workspace')),
  post_type text not null default 'general',
  title text,
  content text not null default '',
  attachment_url text,
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint posts_scope_ck check (
    (scope = 'group' and group_id is not null)
    or (scope = 'workspace' and group_id is null)
  )
);

create table public.materials (
  id uuid primary key default gen_random_uuid (),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  group_id uuid not null references public.groups (id) on delete cascade,
  created_by uuid not null references public.profiles (id),
  material_type text not null check (material_type in ('book', 'lesson', 'reference')),
  title text not null,
  description text,
  file_path text,
  cover_path text,
  order_index int not null default 0,
  status text not null default 'published' check (
    status in ('published', 'draft', 'archived')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.material_parts (
  id uuid primary key default gen_random_uuid (),
  material_id uuid not null references public.materials (id) on delete cascade,
  part_title text not null,
  part_order int not null default 0,
  content text,
  attachment_url text,
  created_at timestamptz not null default now()
);

create table public.schedule_events (
  id uuid primary key default gen_random_uuid (),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  group_id uuid not null references public.groups (id) on delete cascade,
  created_by uuid not null references public.profiles (id),
  event_type text not null default 'class',
  mode text not null default 'on_site' check (mode in ('on_site', 'online')),
  subject_name text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  location text,
  meeting_link text,
  note text,
  status text not null default 'planned' check (
    status in ('planned', 'changed', 'cancelled')
  ),
  created_at timestamptz not null default now()
);

comment on column public.schedule_events.event_type is 'نوع الحدث: class = حصة، seminar = ندوة.';

create table public.conversations (
  id uuid primary key default gen_random_uuid (),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  group_id uuid not null references public.groups (id) on delete cascade,
  conversation_type text not null check (
    conversation_type in ('teacher_student', 'teacher_coordinator')
  ),
  subject text,
  created_by uuid not null references public.profiles (id),
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now()
);

create table public.conversation_participants (
  id uuid primary key default gen_random_uuid (),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  participant_role text not null default 'member',
  unique (conversation_id, user_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid (),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null references public.profiles (id),
  message_kind text not null default 'question',
  body text not null,
  attachment_url text,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create table public.notifications (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references public.profiles (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete cascade,
  target_type text not null,
  target_id uuid,
  title text not null,
  body text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Helper functions (security definer for RLS)
-- ---------------------------------------------------------------------------

create or replace function public.is_workspace_owner (wid uuid, uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspaces w
    where w.id = wid and w.owner_teacher_id = uid
  );
$$;

create or replace function public.group_workspace_id (gid uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select workspace_id from public.groups where id = gid;
$$;

create or replace function public.is_group_member (gid uuid, uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.group_members m
    where m.group_id = gid and m.user_id = uid and m.status = 'active'
  );
$$;

create or replace function public.user_in_workspace (wid uuid, uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.group_members m
    join public.groups g on g.id = m.group_id
    where g.workspace_id = wid and m.user_id = uid and m.status = 'active'
  );
$$;

create or replace function public.user_participates_in_conversation (p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.conversation_participants p
    where
      p.conversation_id = p_conversation_id
      and p.user_id = auth.uid ()
  );
$$;

grant execute on function public.user_participates_in_conversation (uuid) to authenticated;

create or replace function public.conversation_workspace_id (p_conversation_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select workspace_id from public.conversations where id = p_conversation_id;
$$;

grant execute on function public.conversation_workspace_id (uuid) to authenticated;

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
    );
$$;

grant execute on function public.user_can_read_messages_in_conversation (uuid) to authenticated;

-- Student / anyone: join group by code (validates code server-side)
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

grant execute on function public.join_group_by_code (text, text, text) to authenticated;

-- Promote member to coordinator (teacher only)
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
declare
  wid uuid;
begin
  if auth.uid () is null then
    raise exception 'not_authenticated';
  end if;
  wid := public.group_workspace_id (p_group_id);
  if not public.is_workspace_owner (wid, auth.uid ()) then
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

-- Atomic: student/coordinator opens thread with workspace teacher + first message
create or replace function public.start_conversation (
  p_group_id uuid,
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
  tid uuid;
  ctype text;
  conv_id uuid;
  r text;
begin
  if auth.uid () is null then
    raise exception 'not_authenticated';
  end if;
  select g.workspace_id
  into wid
  from public.groups g
  where g.id = p_group_id;

  if wid is null then
    raise exception 'bad_group';
  end if;

  select w.owner_teacher_id
  into tid
  from public.workspaces w
  where w.id = wid;

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
  values (conv_id, auth.uid (), 'member'), (conv_id, tid, 'member');

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

grant execute on function public.start_conversation (uuid, text, text, text) to authenticated;

-- Notify group members (called from app after post — optional; can be triggered later)
create or replace function public.create_notifications_for_post ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (user_id, workspace_id, target_type, target_id, title, body)
  select
    m.user_id,
    new.workspace_id,
    'post',
    new.id,
    coalesce(new.title, 'منشور جديد'),
    left(new.content, 200)
  from public.group_members m
  where
    m.status = 'active'
    and m.user_id <> new.author_id
    and (
      (
        new.scope = 'group'
        and m.group_id = new.group_id
      )
      or (
        new.scope = 'workspace'
        and m.group_id in (
          select id from public.groups where workspace_id = new.workspace_id
        )
      )
    );
  return new;
end;
$$;

create trigger trg_post_notify
after insert on public.posts for each row
execute procedure public.create_notifications_for_post ();

-- ---------------------------------------------------------------------------
-- Auth: new user → profile (+ workspace for teachers)
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r text;
  base_slug text;
begin
  r := coalesce(new.raw_user_meta_data ->> 'role', 'student');
  if r not in ('teacher', 'student') then
    r := 'student';
  end if;

  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    r
  );

  if r = 'teacher' then
    base_slug := 't-' || replace(substr(new.id::text, 1, 13), '-', '');
    insert into public.workspaces (owner_teacher_id, display_name, slug)
    values (
      new.id,
      coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), 'مساحتي'),
      base_slug
    );
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users for each row
execute procedure public.handle_new_user ();

-- When teacher creates a group, add self as teacher member
create or replace function public.add_teacher_to_new_group ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  tid uuid;
  tname text;
begin
  select w.owner_teacher_id, p.full_name
  into tid, tname
  from public.workspaces w
  join public.profiles p on p.id = w.owner_teacher_id
  where w.id = new.workspace_id;

  insert into public.group_members (
    group_id,
    user_id,
    role_in_group,
    display_name
  )
  values (new.id, tid, 'teacher', tname);

  return new;
end;
$$;

create trigger trg_group_add_teacher
after insert on public.groups for each row
execute procedure public.add_teacher_to_new_group ();

-- صفحة عامة للأستاذ (قراءة للزائر عبر slug المساحة)
create or replace function public.public_teacher_by_workspace_slug (p_slug text)
returns table (
  workspace_display_name text,
  workspace_slug text,
  full_name text,
  specialty text,
  bio text,
  avatar_url text,
  phone text,
  whatsapp text,
  office_hours text,
  social_links jsonb,
  cv_path text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    w.display_name,
    w.slug,
    p.full_name,
    p.specialty,
    p.bio,
    p.avatar_url,
    p.phone,
    p.whatsapp,
    p.office_hours,
    coalesce(p.social_links, '{}'::jsonb),
    p.cv_path
  from public.workspaces w
  join public.profiles p on p.id = w.owner_teacher_id
  where
    w.slug = trim(p_slug)
    and w.status = 'active'
    and p.status = 'active'
    and p.role in ('teacher', 'admin')
  limit 1;
$$;

grant execute on function public.public_teacher_by_workspace_slug (text) to anon;

grant execute on function public.public_teacher_by_workspace_slug (text) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.posts enable row level security;
alter table public.materials enable row level security;
alter table public.material_parts enable row level security;
alter table public.schedule_events enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.messages enable row level security;
alter table public.notifications enable row level security;

-- profiles
create policy profiles_select on public.profiles for select using (auth.uid () is not null);

create policy profiles_update_own on public.profiles
for update
using (id = auth.uid ())
with check (id = auth.uid ());

-- workspaces
create policy workspaces_select on public.workspaces for select using (
  owner_teacher_id = auth.uid ()
  or public.user_in_workspace (id, auth.uid ())
);

create policy workspaces_teacher_all on public.workspaces for all using (
  owner_teacher_id = auth.uid ()
)
with check (owner_teacher_id = auth.uid ());

-- groups
create policy groups_select on public.groups for select using (
  public.is_workspace_owner (workspace_id, auth.uid ())
  or public.is_group_member (id, auth.uid ())
);

create policy groups_mutate_teacher on public.groups for insert
with check (public.is_workspace_owner (workspace_id, auth.uid ()));

create policy groups_update_teacher on public.groups
for update
using (public.is_workspace_owner (workspace_id, auth.uid ()));

create policy groups_delete_teacher on public.groups for delete using (
  public.is_workspace_owner (workspace_id, auth.uid ())
);

-- group_members
create policy gm_select on public.group_members for select using (
  public.is_workspace_owner (public.group_workspace_id (group_id), auth.uid ())
  or public.is_group_member (group_id, auth.uid ())
);

create policy gm_insert_teacher on public.group_members for insert
with check (
  public.is_workspace_owner (public.group_workspace_id (group_id), auth.uid ())
);

create policy gm_update_teacher on public.group_members
for update
using (
  public.is_workspace_owner (public.group_workspace_id (group_id), auth.uid ())
);

create policy gm_delete_teacher on public.group_members for delete using (
  public.is_workspace_owner (public.group_workspace_id (group_id), auth.uid ())
);

-- posts
create policy posts_select on public.posts for select using (
  deleted_at is null
  and (
    (
      scope = 'group'
      and public.is_group_member (group_id, auth.uid ())
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
      and public.is_group_member (g.id, auth.uid ())
  )
);

create policy posts_update_teacher on public.posts
for update
using (
  public.is_workspace_owner (workspace_id, auth.uid ())
  and author_id = auth.uid ()
);

create policy posts_delete_teacher on public.posts for delete using (
  public.is_workspace_owner (workspace_id, auth.uid ())
);

-- materials
create policy mat_select on public.materials for select using (
  public.is_group_member (group_id, auth.uid ())
  or public.is_workspace_owner (workspace_id, auth.uid ())
);

create policy mat_write_teacher on public.materials for insert
with check (
  public.is_workspace_owner (workspace_id, auth.uid ())
  and created_by = auth.uid ()
);

create policy mat_update_teacher on public.materials
for update
using (public.is_workspace_owner (workspace_id, auth.uid ()));

create policy mat_delete_teacher on public.materials for delete using (
  public.is_workspace_owner (workspace_id, auth.uid ())
);

-- material_parts (via material)
create policy mp_select on public.material_parts for select using (
  exists (
    select 1
    from public.materials m
    where
      m.id = material_parts.material_id
      and (
        public.is_group_member (m.group_id, auth.uid ())
        or public.is_workspace_owner (m.workspace_id, auth.uid ())
      )
  )
);

create policy mp_write_teacher on public.material_parts for all using (
  exists (
    select 1
    from public.materials m
    where
      m.id = material_parts.material_id
      and public.is_workspace_owner (m.workspace_id, auth.uid ())
  )
)
with check (
  exists (
    select 1
    from public.materials m
    where
      m.id = material_parts.material_id
      and public.is_workspace_owner (m.workspace_id, auth.uid ())
  )
);

-- schedule
create policy sched_select on public.schedule_events for select using (
  public.is_group_member (group_id, auth.uid ())
  or public.is_workspace_owner (workspace_id, auth.uid ())
);

create policy sched_write_teacher on public.schedule_events for insert
with check (
  public.is_workspace_owner (workspace_id, auth.uid ())
  and created_by = auth.uid ()
);

create policy sched_mutate_teacher on public.schedule_events
for update
using (public.is_workspace_owner (workspace_id, auth.uid ()));

create policy sched_delete_teacher on public.schedule_events for delete using (
  public.is_workspace_owner (workspace_id, auth.uid ())
);

-- conversations: participant only (دالة definer لتفادي حلقة RLS مع conversation_participants)
create policy conv_select on public.conversations for select using (
  public.user_participates_in_conversation (id)
  or public.is_workspace_owner (workspace_id, auth.uid ())
);

-- Conversations created only via public.start_conversation (security definer)

create policy conv_update_teacher on public.conversations
for update
using (public.is_workspace_owner (workspace_id, auth.uid ()));

-- participants
create policy cp_select on public.conversation_participants for select using (
  user_id = auth.uid ()
  or public.is_workspace_owner (
    public.conversation_workspace_id (conversation_id),
    auth.uid ()
  )
);

-- Participants added only via public.start_conversation (security definer)

-- messages (قراءة عبر دالة definer لتفادي حلقة RLS مع participants ↔ conversations)
create policy msg_select on public.messages for select using (
  public.user_can_read_messages_in_conversation (conversation_id)
);

create policy msg_insert on public.messages for insert
with check (
  sender_id = auth.uid ()
  and exists (
    select 1
    from public.conversation_participants p
    where
      p.conversation_id = messages.conversation_id
      and p.user_id = auth.uid ()
  )
);

-- notifications
create policy notif_own on public.notifications for select using (
  user_id = auth.uid ()
);

create policy notif_update_own on public.notifications
for update
using (user_id = auth.uid ());

-- Service role inserts notifications via trigger (bypasses RLS) — trigger runs as definer; inserts as superuser? Actually trigger is security definer so it bypasses RLS for insert.

-- ---------------------------------------------------------------------------
-- Storage bucket (run in Dashboard or separate migration if API available)
-- ---------------------------------------------------------------------------
-- insert into storage.buckets (id, public) values ('materials', false);
-- Policies for storage.objects must be added in Dashboard for MVP.
