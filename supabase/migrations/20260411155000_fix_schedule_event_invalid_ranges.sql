-- Invalid starts_at/ends_at breaks gist tstzrange used by schedule_events_no_group_overlap (next migration).
-- Idempotent cleanup for legacy or mistaken UI saves.

update public.schedule_events
set
  ends_at = starts_at + interval '1 hour'
where
  starts_at >= ends_at;
