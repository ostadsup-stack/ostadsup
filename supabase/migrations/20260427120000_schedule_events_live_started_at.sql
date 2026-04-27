-- وقت ضغط الأستاذ «بدء البث»؛ يظهر المؤشر الأخضر للطلاب بعد التعبئة.

alter table public.schedule_events
  add column if not exists live_started_at timestamptz null;

comment on column public.schedule_events.live_started_at is
  'يُعبأ عندما يعلن الأستاذ بدء البث (رأس المنصة)؛ يُستخدم لإظهار المؤشر الأخضر للطلاب قبل/أثناء الحصة.';

create or replace function public.mark_schedule_event_live_started (p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid ();
  gid uuid;
  wid uuid;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  select
    se.group_id,
    se.workspace_id
  into gid, wid
  from
    public.schedule_events se
  where
    se.id = p_event_id;

  if gid is null then
    raise exception 'schedule_event_not_found';
  end if;

  if not (
    public.is_group_staff (gid, uid)
    or public.is_workspace_owner (wid, uid)
    or public.is_profile_admin (uid)
  ) then
    raise exception 'forbidden';
  end if;

  update public.schedule_events se
  set
    live_started_at = coalesce (se.live_started_at, now())
  where
    se.id = p_event_id;
end;
$$;

comment on function public.mark_schedule_event_live_started (uuid) is
  'يضبط live_started_at مرة واحدة لأي معلم نشط في الفوج أو مالك المساحة.';

grant execute on function public.mark_schedule_event_live_started (uuid) to authenticated;
