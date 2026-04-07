-- غلاف اختياري للكتب في مكتبة الأستاذ

alter table public.materials add column if not exists cover_path text;

comment on column public.materials.cover_path is 'مسار صورة الغلاف في حاوية materials (اختياري، للكتب).';
