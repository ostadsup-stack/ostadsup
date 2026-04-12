-- Reject booking (insert or moving start time) when session start is already in the past.

create or replace function public.enforce_schedule_event_start_not_in_past ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'cancelled' then
    return new;
  end if;

  if new.starts_at >= now() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    raise exception using
      message = 'schedule_event_start_in_past',
      detail = 'Cannot schedule a session that starts in the past.',
      errcode = 'P0002';
  end if;

  -- UPDATE: allow note-only (etc.) on rows that were already in the past with same starts_at
  if old.starts_at < now()
  and new.starts_at is not distinct from old.starts_at then
    return new;
  end if;

  raise exception using
    message = 'schedule_event_start_in_past',
    detail = 'Cannot schedule a session that starts in the past.',
    errcode = 'P0002';
end;
$$;

drop trigger if exists trg_enforce_schedule_event_start_not_in_past on public.schedule_events;

create trigger trg_enforce_schedule_event_start_not_in_past
before insert or update on public.schedule_events for each row
execute procedure public.enforce_schedule_event_start_not_in_past ();
