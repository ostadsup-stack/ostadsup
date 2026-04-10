alter table public.profiles
add column if not exists office_hours text;

comment on column public.profiles.office_hours is 'أوقات التواصل / الاستقبال (نص حر)';
