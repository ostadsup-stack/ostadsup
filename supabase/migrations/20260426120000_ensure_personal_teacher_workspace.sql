-- مساحة شخصية للأستاذ أو المدير (admin) عندما لا يملك صفاً في workspaces ولا ربط group_staff.
-- يُصلح واجهة /t للمديرين الذين يُسمح لهم بـ RequireTeacher دون مساحة مُنشأة عند التسجيل.

create or replace function public.ensure_personal_teacher_workspace ()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  wid uuid;
  r text;
  fname text;
  bslug text;
begin
  uid := auth.uid ();
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  select w.id into wid from public.workspaces w where w.owner_teacher_id = uid order by w.created_at asc limit 1;
  if wid is not null then
    return wid;
  end if;

  select p.role, p.full_name into r, fname from public.profiles p where p.id = uid;
  if r is null or r not in ('teacher', 'admin') then
    return null;
  end if;

  bslug := 't-' || replace(substr(uid::text, 1, 13), '-', '');
  insert into public.workspaces (owner_teacher_id, display_name, slug)
  values (
    uid,
    coalesce(nullif(trim(fname), ''), 'مساحتي'),
    bslug
  )
  returning id into wid;

  return wid;
exception
  when unique_violation then
    select w.id into wid from public.workspaces w where w.owner_teacher_id = uid order by w.created_at asc limit 1;
    return wid;
end;
$$;

comment on function public.ensure_personal_teacher_workspace () is
  'يُنشئ مساحة بمالك auth.uid() إن كان teacher أو admin وليس له workspaces بعد؛ وإلا يعيد أول id موجود.';

grant execute on function public.ensure_personal_teacher_workspace () to authenticated;
