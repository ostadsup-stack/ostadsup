-- Run before applying 20260411160000_schedule_overlap_slot_requests.sql on a DB that already has data.
-- Any rows returned must be resolved (reschedule or cancel) or the migration will fail.

select
  a.id as event_a,
  b.id as event_b,
  a.group_id,
  a.starts_at as a_start,
  a.ends_at as a_end,
  b.starts_at as b_start,
  b.ends_at as b_end,
  a.status as status_a,
  b.status as status_b
from
  public.schedule_events a
  join public.schedule_events b on a.group_id = b.group_id
  and a.id < b.id
  and a.status <> 'cancelled'
  and b.status <> 'cancelled'
  and tstzrange (a.starts_at, a.ends_at, '[)') && tstzrange (b.starts_at, b.ends_at, '[)');
