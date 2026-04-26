-- السماح للمدير بتحديث ملفات المستخدمين (مثلاً تعطيل حساب طالب عبر status)

drop policy if exists profiles_update_admin on public.profiles;

create policy profiles_update_admin on public.profiles
for update
using (public.is_profile_admin (auth.uid ()))
with check (public.is_profile_admin (auth.uid ()));
