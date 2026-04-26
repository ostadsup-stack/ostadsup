import { supabase } from './supabase'

export type TeacherAppAdminInboxLine = {
  threadId: string
  lastBody: string | null
  lastAt: string | null
  lastFromAppAdmin: boolean
  hasUnreadFromAdmin: boolean
}

/**
 * بيانات صف «مدير التطبيق» في صندوق محادثات الأستاذ.
 */
export async function loadTeacherAppAdminInboxLine(): Promise<{
  line: TeacherAppAdminInboxLine | null
  error: string | null
}> {
  const { data: tId, error: e0 } = await supabase.rpc('ensure_my_admin_chat_thread')
  if (e0) {
    if (e0.message?.includes('admin console') || e0.message?.includes('use admin messages')) {
      return { line: null, error: null }
    }
    return { line: null, error: e0.message }
  }
  if (!tId) return { line: null, error: null }
  const threadId = tId as string

  const { data: tRow, error: e1 } = await supabase
    .from('admin_chat_threads')
    .select('id, admin_id')
    .eq('id', threadId)
    .single()
  if (e1 || !tRow) {
    return { line: { threadId, lastBody: null, lastAt: null, lastFromAppAdmin: false, hasUnreadFromAdmin: false }, error: e1?.message ?? null }
  }
  const adminId = (tRow as { admin_id: string }).admin_id

  const { count: unreadCount } = await fetchUnreadFromAppAdminForTeacher()
  const hasUnreadFromAdmin = unreadCount > 0

  const { data: lastMsg, error: e2 } = await supabase
    .from('admin_chat_messages')
    .select('sender_id, body, created_at')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (e2) {
    return { line: { threadId, lastBody: null, lastAt: null, lastFromAppAdmin: false, hasUnreadFromAdmin: false }, error: e2.message }
  }

  const m = lastMsg as { sender_id: string; body: string; created_at: string } | null
  if (!m) {
    return {
      line: { threadId, lastBody: null, lastAt: null, lastFromAppAdmin: false, hasUnreadFromAdmin },
      error: null,
    }
  }

  return {
    line: {
      threadId,
      lastBody: m.body,
      lastAt: m.created_at,
      lastFromAppAdmin: m.sender_id === adminId,
      hasUnreadFromAdmin,
    },
    error: null,
  }
}

export async function markAdminChatPeerReadForTeacher(threadId: string) {
  if (!threadId) return
  const { error } = await supabase.rpc('mark_admin_chat_peer_read', { p_thread_id: threadId })
  if (error) return
}

export async function fetchUnreadFromAppAdminForTeacher(): Promise<{
  count: number
  error: string | null
}> {
  const { data, error } = await supabase.rpc('admin_chat_unread_from_admin_count_for_peer')
  if (error) return { count: 0, error: error.message }
  const n = Number(data) || 0
  return { count: n, error: null }
}
