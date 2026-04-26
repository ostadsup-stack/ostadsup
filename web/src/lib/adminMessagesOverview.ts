import { supabase } from './supabase'
import { fetchAdminChatUnreadPeerIds } from './adminAdminChatRead'

export type AdminMessagesOverviewStats = {
  platformUnread: number
  teachers: number
  coordinators: number
  students: number
  error: string | null
}

/** إحصائيات مُوجزة لبطاقة «الرسائل» لحساب المدير. */
export async function loadAdminMessagesOverviewStats(
  userId: string,
): Promise<AdminMessagesOverviewStats> {
  const errBase: AdminMessagesOverviewStats = {
    platformUnread: 0,
    teachers: 0,
    coordinators: 0,
    students: 0,
    error: null,
  }

  const { count: nCount, error: nErr } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_read', false)

  if (nErr) {
    return { ...errBase, error: nErr.message }
  }

  const { ids, error: cErr } = await fetchAdminChatUnreadPeerIds()
  if (cErr) {
    return {
      ...errBase,
      platformUnread: nCount ?? 0,
      error: cErr,
    }
  }
  if (ids.size === 0) {
    return { ...errBase, platformUnread: nCount ?? 0, error: null }
  }

  const peerList = [...ids]
  const { data: profs, error: pErr } = await supabase
    .from('profiles')
    .select('id, role')
    .in('id', peerList)

  if (pErr) {
    return { ...errBase, platformUnread: nCount ?? 0, error: pErr.message }
  }

  const students = (profs ?? []).filter((r) => (r as { role: string }).role === 'student') as { id: string }[]
  const stIds = students.map((s) => s.id)

  let coordSet = new Set<string>()
  if (stIds.length > 0) {
    const { data: gm, error: gErr } = await supabase
      .from('group_members')
      .select('user_id')
      .in('user_id', stIds)
      .eq('role_in_group', 'coordinator')
    if (gErr) {
      return { ...errBase, platformUnread: nCount ?? 0, error: gErr.message }
    }
    coordSet = new Set(
      (gm ?? []).map((r) => (r as { user_id: string }).user_id).filter(Boolean) as string[],
    )
  }

  let t = 0
  let co = 0
  let s = 0
  for (const row of profs ?? []) {
    const r = row as { id: string; role: string }
    if (r.role === 'teacher') t += 1
    else if (r.role === 'student') {
      if (coordSet.has(r.id)) co += 1
      else s += 1
    }
  }

  return {
    platformUnread: nCount ?? 0,
    teachers: t,
    coordinators: co,
    students: s,
    error: null,
  }
}
