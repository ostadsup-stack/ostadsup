-- كليات + ربط كتالوج الأساتذة والأفواج (public.groups).
-- الطلاب: مرتبطون بالأفواج عبر public.group_members (role_in_group = 'student').

-- ---------------------------------------------------------------------------
-- colleges
-- ---------------------------------------------------------------------------
create table public.colleges (
  id uuid primary key default gen_random_uuid (),
  name text not null,
  constraint colleges_name_nonempty_ck check (length(trim(name)) > 0)
);

create index colleges_name_idx on public.colleges (name);

comment on table public.colleges is 'كليات أو وحدات تنظيمية (اسم + معرف).';

-- ---------------------------------------------------------------------------
-- teachers (كتالوج الخطوة 3)
-- ---------------------------------------------------------------------------
alter table public.teachers
add column college_id uuid references public.colleges (id) on delete set null;

create index teachers_college_id_idx on public.teachers (college_id);

comment on column public.teachers.college_id is 'الكلية التي ينتمي إليها سجل الأستاذ في الكتالوج.';

-- ---------------------------------------------------------------------------
-- groups (أفواج Ostadi)
-- ---------------------------------------------------------------------------
alter table public.groups
add column college_id uuid references public.colleges (id) on delete set null;

create index groups_college_id_idx on public.groups (college_id);

comment on column public.groups.college_id is 'الكلية؛ الطلاب المرتبطون بالفوج عبر group_members.';

-- ---------------------------------------------------------------------------
-- RLS: مدير الملف فقط
-- ---------------------------------------------------------------------------
alter table public.colleges enable row level security;

drop policy if exists colleges_all_admin on public.colleges;

create policy colleges_all_admin on public.colleges for all using (public.is_profile_admin (auth.uid ()))
with check (public.is_profile_admin (auth.uid ()));
