-- =============================================================================
-- تطبيق يدوي على مشروع Supabase البعيد عندما تكون الهجرات غير متزامنة مع القاعدة.
-- نفّذ الملف كاملاً من: Dashboard → SQL Editor → Run
--
-- يغطي:
--   - جدول teacher_achievements + RLS
--   - أعمدة materials: cover_path, external_url, link_kind, audience_scope + قيود + RLS
--   - دالة public_workspace_materials_by_slug (نسخة workspace_public)
--   - دالة public_workspace_posts_by_slug
--   - عمود groups.accent_color + دالة teacher_group_list_summaries المحدّثة
--   - سياسة منشورات المنسق + start_conversation_with_teacher + gs_select
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) إنجازات الأستاذ
-- ---------------------------------------------------------------------------
create table if not exists public.teacher_achievements (
  id uuid primary key default gen_random_uuid (),
  teacher_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  year int,
  details text,
  url text,
  sort_order int not null default 0,
  created_at timestamptz not null default now ()
);

create index if not exists teacher_achievements_teacher_id_idx on public.teacher_achievements (teacher_id);

alter table public.teacher_achievements enable row level security;

drop policy if exists ta_select_own on public.teacher_achievements;
drop policy if exists ta_insert_own on public.teacher_achievements;
drop policy if exists ta_update_own on public.teacher_achievements;
drop policy if exists ta_delete_own on public.teacher_achievements;

create policy ta_select_own on public.teacher_achievements for select using (teacher_id = auth.uid ());

create policy ta_insert_own on public.teacher_achievements for insert with check (teacher_id = auth.uid ());

create policy ta_update_own on public.teacher_achievements
for update
using (teacher_id = auth.uid ())
with check (teacher_id = auth.uid ());

create policy ta_delete_own on public.teacher_achievements for delete using (teacher_id = auth.uid ());

-- ---------------------------------------------------------------------------
-- 2) غلاف الكتب
-- ---------------------------------------------------------------------------
alter table public.materials add column if not exists cover_path text;

comment on column public.materials.cover_path is 'مسار صورة الغلاف في حاوية materials (اختياري، للكتب).';

-- ---------------------------------------------------------------------------
-- 3) روابط خارجية + دوال الصفحة العامة (المواد ثم تُستبدل في الخطوة 4)
-- ---------------------------------------------------------------------------
alter table public.materials
add column if not exists external_url text;

alter table public.materials
add column if not exists link_kind text;

alter table public.materials drop constraint if exists materials_link_kind_ck;

alter table public.materials
add constraint materials_link_kind_ck check (
  link_kind is null
  or link_kind in ('seminar', 'video', 'link')
);

comment on column public.materials.external_url is 'رابط ويب للنوع reference (ندوة، فيديو، مرجع)';
comment on column public.materials.link_kind is 'تصنيف عرض اختياري للروابط: seminar | video | link';

create or replace function public.public_workspace_materials_by_slug (p_slug text)
returns table (
  id uuid,
  title text,
  material_type text,
  link_kind text,
  external_url text,
  group_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    m.id,
    m.title,
    m.material_type,
    m.link_kind,
    case
      when m.material_type = 'reference' then nullif(trim(m.external_url), '')
      else null::text
    end as external_url,
    g.group_name
  from public.materials m
  inner join public.groups g on g.id = m.group_id
  inner join public.workspaces w on w.id = m.workspace_id
  where
    w.slug = trim(p_slug)
    and w.status = 'active'
    and g.status = 'active'
    and m.status = 'published'
  order by m.created_at desc;
$$;

grant execute on function public.public_workspace_materials_by_slug (text) to anon;
grant execute on function public.public_workspace_materials_by_slug (text) to authenticated;

create or replace function public.public_workspace_posts_by_slug (p_slug text)
returns table (
  id uuid,
  title text,
  content text,
  created_at timestamptz,
  pinned boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.title,
    p.content,
    p.created_at,
    p.pinned
  from public.posts p
  inner join public.workspaces w on w.id = p.workspace_id
  where
    w.slug = trim(p_slug)
    and w.status = 'active'
    and p.deleted_at is null
    and p.scope = 'workspace'
    and p.group_id is null
  order by p.pinned desc, p.created_at desc
  limit 80;
$$;

grant execute on function public.public_workspace_posts_by_slug (text) to anon;
grant execute on function public.public_workspace_posts_by_slug (text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4) مواد على مستوى المساحة (workspace_public) + RLS مواد وأجزاء المواد
-- ---------------------------------------------------------------------------
alter table public.materials
add column if not exists audience_scope text not null default 'group';

alter table public.materials drop constraint if exists materials_audience_scope_ck;

alter table public.materials
add constraint materials_audience_scope_ck check (
  audience_scope in ('group', 'workspace_public')
);

alter table public.materials drop constraint if exists materials_group_id_fkey;

alter table public.materials alter column group_id drop not null;

alter table public.materials
add constraint materials_group_id_fkey foreign key (group_id) references public.groups (id) on delete cascade;

alter table public.materials drop constraint if exists materials_audience_group_ck;

alter table public.materials
add constraint materials_audience_group_ck check (
  (
    audience_scope = 'group'
    and group_id is not null
  )
  or (
    audience_scope = 'workspace_public'
    and group_id is null
  )
);

comment on column public.materials.audience_scope is
'group: مرتبط بفوج. workspace_public: يظهر للجميع في التطبيق وعلى الصفحة العامة للمساحة.';

drop policy if exists mat_select on public.materials;
drop policy if exists mat_write_teacher on public.materials;
drop policy if exists mat_update_teacher on public.materials;
drop policy if exists mat_delete_teacher on public.materials;

create policy mat_select on public.materials for select using (
  public.is_profile_admin (auth.uid ())
  or (
    audience_scope = 'workspace_public'
    and group_id is null
    and auth.uid () is not null
  )
  or (
    group_id is not null
    and (
      public.is_group_member (group_id, auth.uid ())
      or public.is_workspace_owner (workspace_id, auth.uid ())
      or public.is_group_staff (group_id, auth.uid ())
    )
  )
);

create policy mat_write_teacher on public.materials for insert
with check (
  created_by = auth.uid ()
  and (
    (
      audience_scope = 'group'
      and group_id is not null
      and public.is_group_staff (group_id, auth.uid ())
      and workspace_id = public.group_workspace_id (group_id)
    )
    or (
      audience_scope = 'workspace_public'
      and group_id is null
      and public.is_workspace_owner (workspace_id, auth.uid ())
    )
  )
);

create policy mat_update_teacher on public.materials
for update
using (
  (
    group_id is not null
    and public.is_group_staff (group_id, auth.uid ())
  )
  or (
    group_id is null
    and audience_scope = 'workspace_public'
    and public.is_workspace_owner (workspace_id, auth.uid ())
  )
);

create policy mat_delete_teacher on public.materials for delete using (
  (
    group_id is not null
    and public.is_group_staff (group_id, auth.uid ())
  )
  or (
    group_id is null
    and audience_scope = 'workspace_public'
    and public.is_workspace_owner (workspace_id, auth.uid ())
  )
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
        public.is_profile_admin (auth.uid ())
        or public.is_workspace_owner (m.workspace_id, auth.uid ())
        or (
          m.group_id is not null
          and (
            public.is_group_member (m.group_id, auth.uid ())
            or public.is_group_staff (m.group_id, auth.uid ())
          )
        )
        or (
          m.group_id is null
          and m.audience_scope = 'workspace_public'
          and auth.uid () is not null
        )
      )
  )
);

create policy mp_write_teacher on public.material_parts for all using (
  exists (
    select 1
    from public.materials m
    where
      m.id = material_parts.material_id
      and (
        (
          m.group_id is not null
          and public.is_group_staff (m.group_id, auth.uid ())
        )
        or (
          m.group_id is null
          and m.audience_scope = 'workspace_public'
          and public.is_workspace_owner (m.workspace_id, auth.uid ())
        )
      )
  )
)
with check (
  exists (
    select 1
    from public.materials m
    where
      m.id = material_parts.material_id
      and (
        (
          m.group_id is not null
          and public.is_group_staff (m.group_id, auth.uid ())
        )
        or (
          m.group_id is null
          and m.audience_scope = 'workspace_public'
          and public.is_workspace_owner (m.workspace_id, auth.uid ())
        )
      )
  )
);

create or replace function public.public_workspace_materials_by_slug (p_slug text)
returns table (
  id uuid,
  title text,
  material_type text,
  link_kind text,
  external_url text,
  group_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    m.id,
    m.title,
    m.material_type,
    m.link_kind,
    case
      when m.material_type = 'reference' then nullif(trim(m.external_url), '')
      else null::text
    end as external_url,
    case
      when m.audience_scope = 'workspace_public' and m.group_id is null then 'للعموم'
      else coalesce(g.group_name, '—')
    end as group_name
  from public.materials m
  inner join public.workspaces w on w.id = m.workspace_id
  left join public.groups g on g.id = m.group_id
  where
    w.slug = trim(p_slug)
    and w.status = 'active'
    and m.status = 'published'
    and (
      m.group_id is null
      or (
        g.id is not null
        and g.status = 'active'
      )
    )
  order by m.created_at desc;
$$;

grant execute on function public.public_workspace_materials_by_slug (text) to anon;
grant execute on function public.public_workspace_materials_by_slug (text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5) لون الفوج + teacher_group_list_summaries
-- ---------------------------------------------------------------------------
alter table public.groups add column if not exists accent_color text;

alter table public.groups drop constraint if exists groups_accent_color_fmt_ck;

alter table public.groups
add constraint groups_accent_color_fmt_ck check (
  accent_color is null
  or accent_color ~ '^#[0-9A-Fa-f]{6}$'
);

comment on column public.groups.accent_color is 'لون تمييز الفوج في الواجهة (hex #RRGGBB)';

drop function if exists public.teacher_group_list_summaries(timestamptz, timestamptz);

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
  unread_coordinator_count bigint,
  today_event_subject text,
  today_event_starts_at timestamptz,
  today_event_ends_at timestamptz,
  today_event_mode text,
  join_code text,
  is_owner boolean,
  accent_color text
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
    coalesce(
      (
        select count(*)::bigint
        from public.messages m
        inner join public.conversations c on c.id = m.conversation_id
        where
          c.group_id = g.id
          and c.conversation_type = 'teacher_coordinator'
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
    ),
    g.accent_color
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
-- 6) حائط المنسق + محادثة مع الأستاذ + قراءة group_staff للطلاب
-- ---------------------------------------------------------------------------
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

drop policy if exists gs_select on public.group_staff;

create policy gs_select on public.group_staff for select using (
  teacher_id = auth.uid ()
  or public.is_workspace_owner (public.group_workspace_id (group_id), auth.uid ())
  or public.is_profile_admin (auth.uid ())
  or public.is_group_member (group_id, auth.uid ())
);
