import { supabase } from './supabase'

/** يعيّن “تمت المطالعة” لكل خيوط admin_chat لهذا المستخدم. */
export async function markAdminChatReadForPeer(peerUserId: string) {
  if (!peerUserId) return
  const { error } = await supabase
    .from('admin_chat_threads')
    .update({ admin_last_read_at: new Date().toISOString() })
    .eq('peer_user_id', peerUserId)
  if (error) return
}

export async function fetchAdminChatUnreadPeerIds(): Promise<{ ids: Set<string>; error: string | null }> {
  const { data, error } = await supabase.rpc('admin_chat_unread_peer_ids')
  if (error) return { ids: new Set(), error: error.message }
  const list = (data as string[] | null) ?? []
  return { ids: new Set(list), error: null }
}
