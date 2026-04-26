-- إعدادات عامة للنظام (صف واحد: id = 1)

create table public.settings (
  id int primary key check (id = 1),
  voting_enabled boolean not null default false,
  attendance_enabled boolean not null default false,
  teacher_linking_enabled boolean not null default false,
  updated_at timestamptz not null default now ()
);

comment on table public.settings is 'إعدادات النظام — صف واحد (id=1).';

insert into public.settings (id, voting_enabled, attendance_enabled, teacher_linking_enabled)
values (1, false, false, false)
on conflict (id) do nothing;

alter table public.settings enable row level security;

-- قراءة العلمات لأي مستخدم مسجّل (لاستخدامها لاحقاً في الواجهات)
drop policy if exists settings_select_authenticated on public.settings;

create policy settings_select_authenticated on public.settings for select to authenticated using (true);

drop policy if exists settings_update_admin on public.settings;

create policy settings_update_admin on public.settings
for update
using (public.is_profile_admin (auth.uid ()))
with check (id = 1 and public.is_profile_admin (auth.uid ()));

drop policy if exists settings_insert_admin on public.settings;

create policy settings_insert_admin on public.settings
for insert
with check (public.is_profile_admin (auth.uid ()) and id = 1);
