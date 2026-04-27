-- Allow workspace owners to read schedule_events for their workspace (restores parity with pre–multi-teacher RLS for header / dashboards).
drop policy if exists sched_select on public.schedule_events;

create policy sched_select on public.schedule_events for select using (
  public.is_group_member (group_id, auth.uid ())
  or public.is_group_staff (group_id, auth.uid ())
  or public.is_workspace_owner (workspace_id, auth.uid ())
  or public.is_profile_admin (auth.uid ())
);
