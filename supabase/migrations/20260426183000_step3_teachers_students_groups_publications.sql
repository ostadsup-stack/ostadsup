-- خطوة 3: جداول كتالوج للإدارة / التجارب
--
-- ملاحظة: جدول public.groups موجود مسبقاً في Ostadi (أفواج مرتبطة بـ workspace_id وغيره).
-- الحقول المطلوبة (name, code, owner_teacher_id) وُضعت في public.simple_groups لتجنب التعارض.

-- ---------------------------------------------------------------------------
-- 1) teachers
-- ---------------------------------------------------------------------------
create table public.teachers (
  id uuid primary key default gen_random_uuid (),
  full_name text not null,
  email text not null,
  is_active boolean not null default true,
  constraint teachers_email_nonempty_ck check (length(trim(email)) > 0),
  constraint teachers_full_name_nonempty_ck check (length(trim(full_name)) > 0)
);

create unique index teachers_email_lower_uidx on public.teachers (lower(trim(email)));

comment on table public.teachers is 'كتالوج أساتذة (خطوة 3) — منفصل عن profiles حتى يُربط لاحقاً.';

-- ---------------------------------------------------------------------------
-- 2) students
-- ---------------------------------------------------------------------------
create table public.students (
  id uuid primary key default gen_random_uuid (),
  full_name text not null,
  is_active boolean not null default true,
  constraint students_full_name_nonempty_ck check (length(trim(full_name)) > 0)
);

comment on table public.students is 'كتالوج طلاب (خطوة 3) — منفصل عن profiles حتى يُربط لاحقاً.';

-- ---------------------------------------------------------------------------
-- 3) مجموعات مبسّطة (بديل الاسم «groups» — انظر التعليق أعلى الملف)
-- ---------------------------------------------------------------------------
create table public.simple_groups (
  id uuid primary key default gen_random_uuid (),
  name text not null,
  code text not null,
  owner_teacher_id uuid not null references public.teachers (id) on delete restrict,
  constraint simple_groups_name_nonempty_ck check (length(trim(name)) > 0),
  constraint simple_groups_code_nonempty_ck check (length(trim(code)) > 0)
);

create unique index simple_groups_code_lower_uidx on public.simple_groups (lower(trim(code)));

create index simple_groups_owner_teacher_id_idx on public.simple_groups (owner_teacher_id);

comment on table public.simple_groups is
  'مجموعات مبسّطة (id, name, code, owner_teacher_id). الاسم simple_groups لتفادي التصادم مع public.groups (أفواج Ostadi).';

-- ---------------------------------------------------------------------------
-- 4) publications
-- ---------------------------------------------------------------------------
create table public.publications (
  id uuid primary key default gen_random_uuid (),
  title text not null,
  teacher_id uuid not null references public.teachers (id) on delete restrict,
  is_published boolean not null default false,
  constraint publications_title_nonempty_ck check (length(trim(title)) > 0)
);

create index publications_teacher_id_idx on public.publications (teacher_id);

comment on table public.publications is 'منشورات/إصدارات مرتبطة بسجل teacher في جدول teachers.';

-- ---------------------------------------------------------------------------
-- RLS: وصول المدير فقط (نفس نمط app_invitations)
-- ---------------------------------------------------------------------------
alter table public.teachers enable row level security;
alter table public.students enable row level security;
alter table public.simple_groups enable row level security;
alter table public.publications enable row level security;

drop policy if exists teachers_all_admin on public.teachers;
create policy teachers_all_admin on public.teachers for all using (public.is_profile_admin (auth.uid ()))
with check (public.is_profile_admin (auth.uid ()));

drop policy if exists students_all_admin on public.students;
create policy students_all_admin on public.students for all using (public.is_profile_admin (auth.uid ()))
with check (public.is_profile_admin (auth.uid ()));

drop policy if exists simple_groups_all_admin on public.simple_groups;
create policy simple_groups_all_admin on public.simple_groups for all using (public.is_profile_admin (auth.uid ()))
with check (public.is_profile_admin (auth.uid ()));

drop policy if exists publications_all_admin on public.publications;
create policy publications_all_admin on public.publications for all using (public.is_profile_admin (auth.uid ()))
with check (public.is_profile_admin (auth.uid ()));
