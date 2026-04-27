-- منصة الحصة الأونلاين + إخفاء رابط الدخول عن الطلاب دون حذف الحدث

alter table public.schedule_events
  add column if not exists meeting_provider text;

alter table public.schedule_events
  add column if not exists online_join_enabled boolean;

update public.schedule_events
set meeting_provider = 'jitsi'
where meeting_provider is null;

update public.schedule_events
set meeting_provider = 'custom'
where meeting_link is not null
  and btrim(meeting_link) <> '';

update public.schedule_events
set online_join_enabled = true
where online_join_enabled is null;

alter table public.schedule_events
  alter column meeting_provider set default 'jitsi',
  alter column meeting_provider set not null;

alter table public.schedule_events
  alter column online_join_enabled set default true,
  alter column online_join_enabled set not null;

alter table public.schedule_events
  drop constraint if exists schedule_events_meeting_provider_check;

alter table public.schedule_events
  add constraint schedule_events_meeting_provider_check
  check (meeting_provider in ('jitsi', 'google_meet', 'custom'));

comment on column public.schedule_events.meeting_provider is
  'jitsi: غرفة Ostadi من معرف المساحة؛ google_meet: رابط Google Meet في meeting_link؛ custom: أي رابط آخر.';

comment on column public.schedule_events.online_join_enabled is
  'عند false لا يُقترح للطلاب رابط الدخول من المنصة حتى يفعّل الأستاذ من جديد (لا يغلق تبويبات Meet/Jitsi المفتوحة تلقائياً).';
