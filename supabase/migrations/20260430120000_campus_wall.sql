-- حائط الجامعة/الكلية: منشورات أكاديمية على مستوى المنصة + تعليقات + بلاغات + إعدادات صلاحيات

-- ---------------------------------------------------------------------------
-- إعدادات الصلاحيات (صف واحد id = 1)
-- الأدوار: admin, teacher, coordinator, student
-- ---------------------------------------------------------------------------
create table if not exists public.campus_wall_settings (
  id int primary key check (id = 1),
  write_roles text[] not null default array['admin', 'teacher']::text[],
  comment_roles text[] not null default array['admin', 'teacher', 'coordinator', 'student']::text[],
  pin_roles text[] not null default array['admin']::text[],
  delete_roles text[] not null default array['admin']::text[],
  require_approval_roles text[] not null default array['coordinator', 'student']::text[],
  extra_student_writer_ids uuid[] not null default array[]::uuid[],
  updated_at timestamptz not null default now ()
);

comment on table public.campus_wall_settings is 'صلاحيات حائط الجامعة — صف واحد.';

insert into public.campus_wall_settings (id)
values (1)
on conflict (id) do nothing;

alter table public.campus_wall_settings enable row level security;

drop policy if exists campus_wall_settings_select_auth on public.campus_wall_settings;

create policy campus_wall_settings_select_auth on public.campus_wall_settings for
select
to authenticated using (true);

drop policy if exists campus_wall_settings_update_admin on public.campus_wall_settings;

create policy campus_wall_settings_update_admin on public.campus_wall_settings
for update
using (public.is_profile_admin (auth.uid ()))
with check (id = 1 and public.is_profile_admin (auth.uid ()));

drop policy if exists campus_wall_settings_insert_admin on public.campus_wall_settings;

create policy campus_wall_settings_insert_admin on public.campus_wall_settings
for insert
with check (public.is_profile_admin (auth.uid ()) and id = 1);

-- ---------------------------------------------------------------------------
-- منشورات الحائط
-- ---------------------------------------------------------------------------
create table if not exists public.campus_wall_posts (
  id uuid primary key default gen_random_uuid (),
  college_id uuid references public.colleges (id) on delete set null,
  group_id uuid references public.groups (id) on delete set null,
  author_id uuid not null references public.profiles (id) on delete restrict,
  post_kind text not null default 'admin_notice' check (
    post_kind in (
      'admin_notice',
      'study_alert',
      'training_opportunity',
      'campus_event',
      'study_material',
      'achievement'
    )
  ),
  importance text not null default 'normal' check (importance in ('normal', 'high', 'urgent')),
  title text,
  body text not null,
  attachments jsonb not null default '[]'::jsonb,
  pinned boolean not null default false,
  moderation_status text not null default 'published' check (
    moderation_status in ('draft', 'pending', 'published', 'rejected')
  ),
  hidden_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now (),
  updated_at timestamptz not null default now (),
  constraint campus_wall_posts_body_nonempty check (length (trim (body)) > 0),
  constraint campus_wall_posts_attachments_array_ck check (jsonb_typeof (attachments) = 'array')
);

comment on table public.campus_wall_posts is 'منشورات الحائط الأكاديمي على مستوى المنصة.';

create index if not exists campus_wall_posts_created_idx on public.campus_wall_posts (created_at desc);

create index if not exists campus_wall_posts_status_idx on public.campus_wall_posts (moderation_status);

create index if not exists campus_wall_posts_college_idx on public.campus_wall_posts (college_id);

create index if not exists campus_wall_posts_group_idx on public.campus_wall_posts (group_id);

create index if not exists campus_wall_posts_pinned_idx on public.campus_wall_posts (pinned desc, created_at desc);

-- ---------------------------------------------------------------------------
-- تعليقات
-- ---------------------------------------------------------------------------
create table if not exists public.campus_wall_comments (
  id uuid primary key default gen_random_uuid (),
  post_id uuid not null references public.campus_wall_posts (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  deleted_at timestamptz,
  created_at timestamptz not null default now (),
  constraint campus_wall_comments_body_nonempty check (length (trim (body)) > 0)
);

create index if not exists campus_wall_comments_post_idx on public.campus_wall_comments (post_id, created_at);

-- ---------------------------------------------------------------------------
-- بلاغات
-- ---------------------------------------------------------------------------
create table if not exists public.campus_wall_reports (
  id uuid primary key default gen_random_uuid (),
  post_id uuid not null references public.campus_wall_posts (id) on delete cascade,
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  reason text,
  status text not null default 'open' check (status in ('open', 'reviewed', 'dismissed')),
  created_at timestamptz not null default now ()
);

create index if not exists campus_wall_reports_post_idx on public.campus_wall_reports (post_id);

create index if not exists campus_wall_reports_open_idx on public.campus_wall_reports (status)
where
  status = 'open';

-- ---------------------------------------------------------------------------
-- دوال مساعدة
-- ---------------------------------------------------------------------------
create or replace function public.campus_wall_effective_role (p_uid uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when exists (
      select 1
      from public.profiles pr
      where
        pr.id = p_uid
        and pr.role = 'admin'
    ) then 'admin'
    when exists (
      select 1
      from public.group_members gm
      where
        gm.user_id = p_uid
        and gm.status = 'active'
        and gm.role_in_group = 'coordinator'
    ) then 'coordinator'
    when exists (
      select 1
      from public.profiles pr
      where
        pr.id = p_uid
        and pr.role = 'teacher'
    ) then 'teacher'
    else 'student'
  end;
$$;

comment on function public.campus_wall_effective_role (uuid) is
'دور المستخدم على الحائط: منسّق الفوج يتقدّم على أستاذ/طالب للصلاحيات.';

grant execute on function public.campus_wall_effective_role (uuid) to authenticated;

create or replace function public.campus_wall_settings_row ()
returns public.campus_wall_settings
language sql
stable
security definer
set search_path = public
as $$
  select *
  from public.campus_wall_settings
  where
    id = 1
  limit 1;
$$;

grant execute on function public.campus_wall_settings_row () to authenticated;

create or replace function public.campus_wall_can_write (p_uid uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  s public.campus_wall_settings;
  r text;
begin
  if public.is_profile_admin (p_uid) then
    return true;
  end if;
  s := public.campus_wall_settings_row ();
  if s is null then
    return false;
  end if;
  if s.extra_student_writer_ids @> array[p_uid] then
    return true;
  end if;
  r := public.campus_wall_effective_role (p_uid);
  return r = any (s.write_roles);
end;
$$;

grant execute on function public.campus_wall_can_write (uuid) to authenticated;

create or replace function public.campus_wall_requires_approval (p_uid uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  s public.campus_wall_settings;
  r text;
begin
  if public.is_profile_admin (p_uid) then
    return false;
  end if;
  s := public.campus_wall_settings_row ();
  if s is null then
    return true;
  end if;
  r := public.campus_wall_effective_role (p_uid);
  return r = any (s.require_approval_roles);
end;
$$;

grant execute on function public.campus_wall_requires_approval (uuid) to authenticated;

create or replace function public.campus_wall_can_comment (p_uid uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  s public.campus_wall_settings;
  r text;
begin
  if public.is_profile_admin (p_uid) then
    return true;
  end if;
  s := public.campus_wall_settings_row ();
  if s is null then
    return false;
  end if;
  r := public.campus_wall_effective_role (p_uid);
  return r = any (s.comment_roles);
end;
$$;

grant execute on function public.campus_wall_can_comment (uuid) to authenticated;

create or replace function public.campus_wall_can_pin (p_uid uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  s public.campus_wall_settings;
  r text;
begin
  if public.is_profile_admin (p_uid) then
    return true;
  end if;
  s := public.campus_wall_settings_row ();
  if s is null then
    return false;
  end if;
  r := public.campus_wall_effective_role (p_uid);
  return r = any (s.pin_roles);
end;
$$;

grant execute on function public.campus_wall_can_pin (uuid) to authenticated;

create or replace function public.campus_wall_can_delete_any (p_uid uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  s public.campus_wall_settings;
  r text;
begin
  if public.is_profile_admin (p_uid) then
    return true;
  end if;
  s := public.campus_wall_settings_row ();
  if s is null then
    return false;
  end if;
  r := public.campus_wall_effective_role (p_uid);
  return r = any (s.delete_roles);
end;
$$;

grant execute on function public.campus_wall_can_delete_any (uuid) to authenticated;

create or replace function public.campus_wall_post_readable (p_post_id uuid, p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.campus_wall_posts p
    where
      p.id = p_post_id
      and p.deleted_at is null
      and (
        public.is_profile_admin (p_uid)
        or p.author_id = p_uid
        or (
          p.hidden_at is null
          and p.moderation_status = 'published'
        )
      )
  );
$$;

grant execute on function public.campus_wall_post_readable (uuid, uuid) to authenticated;

-- إدراج: ضبط حالة المراجعة للغير مدير
create or replace function public.trg_campus_wall_posts_before_insert ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now ();
  if public.is_profile_admin (new.author_id) then
    return new;
  end if;
  if public.campus_wall_requires_approval (new.author_id) then
    new.moderation_status := 'pending';
  else
    new.moderation_status := 'published';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_campus_wall_posts_bi on public.campus_wall_posts;

create trigger trg_campus_wall_posts_bi before insert on public.campus_wall_posts for each row
execute procedure public.trg_campus_wall_posts_before_insert ();

-- تحديث: حماية أعمدة حساسة لغير المدير
create or replace function public.trg_campus_wall_posts_before_update ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now ();
  if public.is_profile_admin (auth.uid ()) then
    return new;
  end if;
  if new.author_id is distinct from old.author_id then
    raise exception 'campus_wall: cannot change author';
  end if;
  if new.moderation_status is distinct from old.moderation_status then
    raise exception 'campus_wall: only admin can change moderation';
  end if;
  if old.author_id is distinct from auth.uid () then
    if not public.campus_wall_can_delete_any (auth.uid ()) then
      raise exception 'campus_wall: not post author';
    end if;
    if new.college_id is distinct from old.college_id
    or new.group_id is distinct from old.group_id
    or new.post_kind is distinct from old.post_kind
    or new.importance is distinct from old.importance
    or new.title is distinct from old.title
    or new.body is distinct from old.body
    or new.attachments is distinct from old.attachments
    or new.pinned is distinct from old.pinned then
      raise exception 'campus_wall: moderators may only hide or archive';
    end if;
    return new;
  end if;
  if new.pinned is distinct from old.pinned then
    if not public.campus_wall_can_pin (auth.uid ()) then
      raise exception 'campus_wall: cannot pin';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_campus_wall_posts_bu on public.campus_wall_posts;

create trigger trg_campus_wall_posts_bu before update on public.campus_wall_posts for each row
execute procedure public.trg_campus_wall_posts_before_update ();

-- ---------------------------------------------------------------------------
-- RLS: المنشورات
-- ---------------------------------------------------------------------------
alter table public.campus_wall_posts enable row level security;

drop policy if exists campus_wall_posts_select on public.campus_wall_posts;

create policy campus_wall_posts_select on public.campus_wall_posts for
select
using (
  deleted_at is null
  and (
    public.is_profile_admin (auth.uid ())
    or author_id = auth.uid ()
    or (
      hidden_at is null
      and moderation_status = 'published'
    )
    or (
      hidden_at is null
      and moderation_status = 'pending'
      and author_id = auth.uid ()
    )
  )
);

drop policy if exists campus_wall_posts_insert on public.campus_wall_posts;

create policy campus_wall_posts_insert on public.campus_wall_posts for insert
with check (
  author_id = auth.uid ()
  and (
    public.is_profile_admin (auth.uid ())
    or public.campus_wall_can_write (auth.uid ())
  )
);

drop policy if exists campus_wall_posts_update on public.campus_wall_posts;

create policy campus_wall_posts_update on public.campus_wall_posts
for update
using (
  public.is_profile_admin (auth.uid ())
  or (
    author_id = auth.uid ()
    and deleted_at is null
    and (
      moderation_status in ('pending', 'published')
    )
  )
  or (
    public.campus_wall_can_delete_any (auth.uid ())
    and deleted_at is null
  )
)
with check (
  public.is_profile_admin (auth.uid ())
  or author_id = auth.uid ()
  or public.campus_wall_can_delete_any (auth.uid ())
);

-- حذف فعلي غير مطلوب — أرشفة عبر deleted_at
-- ---------------------------------------------------------------------------
-- RLS: التعليقات
-- ---------------------------------------------------------------------------
alter table public.campus_wall_comments enable row level security;

drop policy if exists campus_wall_comments_select on public.campus_wall_comments;

create policy campus_wall_comments_select on public.campus_wall_comments for
select
using (
  deleted_at is null
  and (
    public.is_profile_admin (auth.uid ())
    or public.campus_wall_post_readable (post_id, auth.uid ())
  )
);

drop policy if exists campus_wall_comments_insert on public.campus_wall_comments;

create policy campus_wall_comments_insert on public.campus_wall_comments for insert
with check (
  author_id = auth.uid ()
  and public.campus_wall_can_comment (auth.uid ())
  and public.campus_wall_post_readable (post_id, auth.uid ())
);

drop policy if exists campus_wall_comments_update on public.campus_wall_comments;

create policy campus_wall_comments_update on public.campus_wall_comments
for update
using (
  public.is_profile_admin (auth.uid ())
  or author_id = auth.uid ()
)
with check (
  public.is_profile_admin (auth.uid ())
  or author_id = auth.uid ()
);

-- ---------------------------------------------------------------------------
-- RLS: البلاغات
-- ---------------------------------------------------------------------------
alter table public.campus_wall_reports enable row level security;

drop policy if exists campus_wall_reports_select_admin on public.campus_wall_reports;

create policy campus_wall_reports_select_admin on public.campus_wall_reports for
select
using (public.is_profile_admin (auth.uid ()));

drop policy if exists campus_wall_reports_insert on public.campus_wall_reports;

create policy campus_wall_reports_insert on public.campus_wall_reports for insert
with check (
  reporter_id = auth.uid ()
  and public.campus_wall_post_readable (post_id, auth.uid ())
);

drop policy if exists campus_wall_reports_update_admin on public.campus_wall_reports;

create policy campus_wall_reports_update_admin on public.campus_wall_reports
for update
using (public.is_profile_admin (auth.uid ()))
with check (true);

-- ---------------------------------------------------------------------------
-- إحصاءات لوحة المدير
-- ---------------------------------------------------------------------------
create or replace function public.admin_campus_wall_stats ()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  s public.campus_wall_settings;
  post_count int;
  pending_count int;
  report_open int;
  writers int;
begin
  if not public.is_profile_admin (auth.uid ()) then
    raise exception 'forbidden';
  end if;
  s := public.campus_wall_settings_row ();
  select count(*) into post_count from public.campus_wall_posts where deleted_at is null;
  select count(*) into pending_count
  from public.campus_wall_posts
  where
    deleted_at is null
    and moderation_status = 'pending';
  select count(*) into report_open from public.campus_wall_reports where status = 'open';
  with
    ids as (
      select p.id
      from public.profiles p
      where
        p.role = 'admin'
        and s.write_roles @> array['admin']::text[]
      union
      select p.id
      from public.profiles p
      where
        p.role = 'teacher'
        and s.write_roles @> array['teacher']::text[]
      union
      select distinct gm.user_id
      from public.group_members gm
      where
        gm.status = 'active'
        and gm.role_in_group = 'coordinator'
        and s.write_roles @> array['coordinator']::text[]
      union
      select p.id
      from public.profiles p
      where
        p.role = 'student'
        and s.write_roles @> array['student']::text[]
      union
      select unnest (coalesce (s.extra_student_writer_ids, array[]::uuid[]))
    )
  select count(*) into writers
  from ids;
  return jsonb_build_object(
    'post_count',
    post_count,
    'pending_count',
    pending_count,
    'authorized_writer_count',
    writers,
    'open_report_count',
    report_open
  );
end;
$$;

comment on function public.admin_campus_wall_stats () is 'إحصاءات حائط الجامعة — للمدير فقط.';

grant execute on function public.admin_campus_wall_stats () to authenticated;

-- قراءة أسماء الكليات للفلاتر (أي مستخدم مسجّل)
drop policy if exists colleges_select_authenticated on public.colleges;

create policy colleges_select_authenticated on public.colleges for
select
to authenticated using (true);

-- صلاحياتي على الحائط (للواجهة)
create or replace function public.campus_wall_my_capabilities ()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'can_write',
    public.campus_wall_can_write (auth.uid ()),
    'can_comment',
    public.campus_wall_can_comment (auth.uid ()),
    'can_pin',
    public.campus_wall_can_pin (auth.uid ()),
    'can_delete_any',
    public.campus_wall_can_delete_any (auth.uid ()),
    'effective_role',
    public.campus_wall_effective_role (auth.uid ()),
    'is_admin',
    public.is_profile_admin (auth.uid ())
  );
$$;

comment on function public.campus_wall_my_capabilities () is 'ملخص صلاحيات المستخدم الحالي على حائط الجامعة.';

grant execute on function public.campus_wall_my_capabilities () to authenticated;

notify pgrst, 'reload schema';
