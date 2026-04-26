-- أساتذة الكتالوج: تخصص + ربط اختياري بحساب المنصة (لعدّ الأفواج وإنشاء groups تحت workspace الأستاذ).
-- مساحات عمل: السماح للمدير بإنشاء مساحة لأستاذ عند الحاجة (مثلاً قبل أول فوج).

alter table public.teachers
add column if not exists specialty text;

comment on column public.teachers.specialty is 'تخصص الأستاذ (عرض في واجهة الإدارة).';

alter table public.teachers
add column if not exists profile_id uuid references public.profiles (id) on delete set null;

create index if not exists teachers_profile_id_idx on public.teachers (profile_id);

comment on column public.teachers.profile_id is 'ربط اختياري بملف teacher/admin في المنصة — لربط الأفواج بـ workspaces.owner_teacher_id.';

create unique index if not exists teachers_profile_id_uidx on public.teachers (profile_id)
where
  profile_id is not null;

-- ---------------------------------------------------------------------------
-- workspaces: إدراج من قبل المدير (إنشاء مساحة لأستاذ بلا مساحة بعد)
-- ---------------------------------------------------------------------------
drop policy if exists workspaces_insert_admin on public.workspaces;

create policy workspaces_insert_admin on public.workspaces for insert
with check (public.is_profile_admin (auth.uid ()));
