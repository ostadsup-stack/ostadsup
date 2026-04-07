-- تجنب EXISTS على conversations داخل cp_select (يُكمّل إصلاح conv_select ويكسر أي حلقة RLS متبقية).
create or replace function public.conversation_workspace_id (p_conversation_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select workspace_id from public.conversations where id = p_conversation_id;
$$;

grant execute on function public.conversation_workspace_id (uuid) to authenticated;

drop policy if exists cp_select on public.conversation_participants;

create policy cp_select on public.conversation_participants for select using (
  user_id = auth.uid ()
  or public.is_workspace_owner (
    public.conversation_workspace_id (conversation_id),
    auth.uid ()
  )
);
