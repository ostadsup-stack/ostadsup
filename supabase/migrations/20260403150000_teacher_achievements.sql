-- إنجازات الأستاذ (CRUD خاص بالمالك)

create table public.teacher_achievements (
  id uuid primary key default gen_random_uuid (),
  teacher_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  year int,
  details text,
  url text,
  sort_order int not null default 0,
  created_at timestamptz not null default now ()
);

create index teacher_achievements_teacher_id_idx on public.teacher_achievements (teacher_id);

alter table public.teacher_achievements enable row level security;

create policy ta_select_own on public.teacher_achievements for select using (teacher_id = auth.uid ());

create policy ta_insert_own on public.teacher_achievements for insert with check (teacher_id = auth.uid ());

create policy ta_update_own on public.teacher_achievements
for update
using (teacher_id = auth.uid ())
with check (teacher_id = auth.uid ());

create policy ta_delete_own on public.teacher_achievements for delete using (teacher_id = auth.uid ());
