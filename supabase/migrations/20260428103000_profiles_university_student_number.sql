-- الرقم الجامعي على مستوى حساب الطالب (يُحرَّر من «بياناتي»)
alter table public.profiles
  add column if not exists university_student_number text;

comment on column public.profiles.university_student_number is 'الرقم الجامعي — يحرره الطالب من صفحة بياناتي.';
