-- Align with is_workspace_owner / is_group_staff: helper used inside RLS must not
-- depend on invoker visibility on joined tables (groups, group_staff).
create or replace function public.is_workspace_teacher (wid uuid, uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_workspace_owner (wid, uid)
    or exists (
      select 1
      from public.groups g
      inner join public.group_staff gs
        on gs.group_id = g.id
        and gs.teacher_id = uid
        and gs.status = 'active'
      where g.workspace_id = wid
    );
$$;

comment on function public.is_workspace_teacher (uuid, uuid) is
'مالك المساحة أو أستاذ نشط في group_staff ضمن إحدى أفواج المساحة.';
