-- يُصلح مستخدمين بجلسة فعّالة دون صف في profiles (مثلاً بعد تأكيد البريد إن فاتهم المشغّل)
create or replace function public.ensure_my_profile ()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  meta jsonb;
  r text;
  fname text;
  uid uuid;
  slug text;
begin
  uid := auth.uid ();
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  if exists (select 1 from public.profiles p where p.id = uid) then
    return;
  end if;

  select u.raw_user_meta_data into meta from auth.users u where u.id = uid;

  if meta is null then
    meta := '{}'::jsonb;
  end if;

  r := coalesce(meta ->> 'role', 'student');
  if r not in ('teacher', 'student') then
    r := 'student';
  end if;

  fname := coalesce(nullif(trim(meta ->> 'full_name'), ''), '');

  insert into public.profiles (id, full_name, role)
  values (uid, fname, r);

  if r = 'teacher' then
    slug := 't-' || replace(substr(uid::text, 1, 13), '-', '');
    insert into public.workspaces (owner_teacher_id, display_name, slug)
    values (
      uid,
      coalesce(nullif(trim(fname), ''), 'مساحتي'),
      slug
    );
  end if;
end;
$$;

grant execute on function public.ensure_my_profile () to authenticated;
