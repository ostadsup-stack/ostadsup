-- كسر حلقة RLS المحتملة عند قراءة الرسائل: سياسة msg_select كانت تربط
-- conversation_participants بـ conversations تحت RLS المتسلسل.
-- الدالة تقرأ الجداول كمالك الدالة (بدون RLS) بنفس منطق السياسة السابقة.
create or replace function public.user_can_read_messages_in_conversation (p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1
      from public.conversation_participants p
      where
        p.conversation_id = p_conversation_id
        and p.user_id = (select auth.uid ())
    )
    or exists (
      select 1
      from public.conversations c
      where
        c.id = p_conversation_id
        and exists (
          select 1
          from public.workspaces w
          where
            w.id = c.workspace_id
            and w.owner_teacher_id = (select auth.uid ())
        )
    );
$$;

grant execute on function public.user_can_read_messages_in_conversation (uuid) to authenticated;

drop policy if exists msg_select on public.messages;

create policy msg_select on public.messages for select using (
  public.user_can_read_messages_in_conversation (conversation_id)
);
