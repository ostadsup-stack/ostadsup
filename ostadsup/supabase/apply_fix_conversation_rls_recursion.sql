-- =============================================================================
-- إصلاح خطأ: infinite recursion detected in policy for relation
-- "conversation_participants"
-- =============================================================================
-- نفّذ هذا الملف كاملاً في Supabase → SQL Editor (مشروعك الحالي)، ثم حدّث
-- صفحة التطبيق. آمن لإعادة التنفيذ (CREATE OR REPLACE + DROP POLICY IF EXISTS).
-- الترتيب مهم: conv_select → cp_select → msg_select
-- =============================================================================

-- (1) conv_select عبر دالة SECURITY DEFINER
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

-- (2) cp_select بدون EXISTS مباشر على conversations تحت RLS
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

-- (3) msg_select عبر دالة SECURITY DEFINER (قراءة الرسائل)
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
ذ