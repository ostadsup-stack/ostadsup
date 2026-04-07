-- حقول إضافية لبطاقة حساب الأستاذ (هاتف، واتساب، نبذة)
alter table public.profiles
add column if not exists phone text;

alter table public.profiles
add column if not exists whatsapp text;

alter table public.profiles
add column if not exists bio text;

comment on column public.profiles.phone is 'هاتف للعرض والتواصل (اختياري)';
comment on column public.profiles.whatsapp is 'رقم واتساب أو رابط wa.me (اختياري)';
comment on column public.profiles.bio is 'بطاقة تعريفية قصيرة (اختياري)';
