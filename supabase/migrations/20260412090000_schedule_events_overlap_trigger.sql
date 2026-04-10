-- Redundant safety net: BEFORE INSERT/UPDATE overlap check with SECURITY DEFINER so RLS cannot hide
-- conflicting rows from the checker. Complements schedule_events_no_group_overlap (EXCLUDE).
-- Existing bad rows are unchanged until edited; use supabase/queries/audit_schedule_overlaps.sql to find them.

create or replace function public.enforce_schedule_event_no_time_overlap ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'cancelled' then
    return new;
  end if;

  if exists (
    select
      1
    from
      public.schedule_events se
    where
      se.group_id = new.group_id
      and se.id is distinct from new.id
      and se.status <> 'cancelled'
      and tstzrange (se.starts_at, se.ends_at, '[)')
      && tstzrange (new.starts_at, new.ends_at, '[)')
  ) then
    raise exception using
      message = 'schedule_events_no_group_overlap',
      detail = 'Same group cannot have two non-cancelled overlapping time ranges.',
      errcode = '23P01';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_schedule_event_no_time_overlap on public.schedule_events;

create trigger trg_enforce_schedule_event_no_time_overlap
before insert or update on public.schedule_events for each row
execute procedure public.enforce_schedule_event_no_time_overlap ();
