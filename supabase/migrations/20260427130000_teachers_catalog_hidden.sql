-- إخفاء سجل الأستاذ من العرض في كتالوجات/قوائم يحترمها الطلّاب أو الواجهات العامة (يتحكم به المدير من لوحة الأساتذة).

alter table public.teachers
add column if not exists catalog_hidden boolean not null default false;

comment on column public.teachers.catalog_hidden is 'عند true يُعامل الأستاذ كمخفي في القوائم العامة (إعداد إداري).';
