-- Admin: قراءة المساحات، إنشاء/حذف الأفواج، وتتبع دعوات التسجيل (بريد + دور)

-- ---------------------------------------------------------------------------
-- Workspaces: السماح للمدير بعرض كل المساحات (لربط فوج بمساحة)
-- ---------------------------------------------------------------------------
drop policy if exists workspaces_select_admin on public.workspaces;
create policy workspaces_select_admin on public.workspaces
for select
using (public.is_profile_admin (auth.uid ()));

-- ---------------------------------------------------------------------------
-- groups: إدراج وحذف من قبل المدير
-- ---------------------------------------------------------------------------
drop policy if exists groups_insert_admin on public.groups;
create policy groups_insert_admin on public.groups
for insert
with check (public.is_profile_admin (auth.uid ()));

drop policy if exists groups_delete_admin on public.groups;
create policy groups_delete_admin on public.groups
for delete
using (public.is_profile_admin (auth.uid ()));

-- ---------------------------------------------------------------------------
-- app_invitations: دعوات (بريد + دور أستاذ/طالب) — تسجيل سجل للمتابعة
-- ---------------------------------------------------------------------------
create table if not exists public.app_invitations (
  id uuid primary key default gen_random_uuid (),
  email text not null,
  invited_role text not null check (invited_role in ('teacher', 'student')),
  status text not null default 'pending' check (
    status in ('pending', 'accepted', 'revoked', 'expired')
  ),
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now ()
);

create index if not exists app_invitations_created_at_idx
  on public.app_invitations (created_at desc);

create unique index if not exists app_invitations_email_role_pending_uidx
  on public.app_invitations (lower(trim(email)), invited_role)
  where status = 'pending';

comment on table public.app_invitations is
  'دعوات تسجيل يسجّلها المدير؛ إرسال البريد يتطلب خدمة خلفية (Edge) وربط اختياري.';

alter table public.app_invitations enable row level security;

drop policy if exists app_invitations_select on public.app_invitations;
create policy app_invitations_select on public.app_invitations
for select
using (public.is_profile_admin (auth.uid ()));

drop policy if exists app_invitations_insert on public.app_invitations;
create policy app_invitations_insert on public.app_invitations
for insert
with check (
  public.is_profile_admin (auth.uid ())
  and created_by = auth.uid ()
);

drop policy if exists app_invitations_update on public.app_invitations;
create policy app_invitations_update on public.app_invitations
for update
using (public.is_profile_admin (auth.uid ()));

drop policy if exists app_invitations_delete on public.app_invitations;
create policy app_invitations_delete on public.app_invitations
for delete
using (public.is_profile_admin (auth.uid ()));
