-- إصلاح قراءة conversation_participants: السياسة السابقة كانت تستعلم عن نفس الجدول
-- داخل EXISTS مما يطبّق RLS بشكل متكرر ويمنع الطالب من رؤية صف مشاركته،
-- فيفشل تحميل المحادثة والرسائل (.single() → «غير موجود»).
drop policy if exists cp_select on public.conversation_participants;

create policy cp_select on public.conversation_participants for select using (
  user_id = auth.uid ()
  or exists (
    select 1
    from public.conversations c
    where
      c.id = conversation_participants.conversation_id
      and public.is_workspace_owner (c.workspace_id, auth.uid ())
  )
);
