-- كسر حلقة RLS بين conversations و conversation_participants:
-- conv_select كان يستعلم عن participants، وcp_select يستعلم عن conversations
-- فيتسبب ذلك أحياناً في «infinite recursion» أو صفاً لا يُرى → .single() يفشل و«غير موجود».
create or replace function public.user_participates_in_conversation (p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.conversation_participants p
    where
      p.conversation_id = p_conversation_id
      and p.user_id = auth.uid ()
  );
$$;

grant execute on function public.user_participates_in_conversation (uuid) to authenticated;

drop policy if exists conv_select on public.conversations;

create policy conv_select on public.conversations for select using (
  public.user_participates_in_conversation (id)
  or public.is_workspace_owner (workspace_id, auth.uid ())
);
