import type { SupabaseClient } from '@supabase/supabase-js'

export type LiveSessionIndicatorKind = 'green' | 'orange' | 'red'

export type LiveSessionIndicator = {
  kind: LiveSessionIndicatorKind
  label: string
}

export type LiveSessionEventRow = {
  id: string
  workspace_id: string
  group_id: string
  starts_at: string
  ends_at: string
  status: string | null
  event_type: string | null
  mode: string
  /** PostgREST قد يعيد كائناً أو مصفوفة حسب الإصدار */
  workspaces: { slug: string } | { slug: string }[] | null
}

const HOUR_MS = 60 * 60 * 1000
const RED_WINDOW_MS = 2 * HOUR_MS

const SELECT_EVENTS =
  'id, workspace_id, group_id, starts_at, ends_at, status, event_type, mode, workspaces(slug)'

function windowBounds() {
  const now = Date.now()
  const past = new Date(now - 3 * 60 * 60 * 1000).toISOString()
  const future = new Date(now + 25 * 60 * 60 * 1000).toISOString()
  return { past, future }
}

function isOnlineClass(e: LiveSessionEventRow): boolean {
  if ((e.status ?? 'planned') === 'cancelled') return false
  if ((e.event_type ?? 'class') !== 'class') return false
  return e.mode === 'online'
}

function slugOf(e: LiveSessionEventRow): string | null {
  const w = e.workspaces
  const raw = Array.isArray(w) ? w[0]?.slug : w?.slug
  const s = raw?.trim()
  return s && s.length > 0 ? s : null
}

/**
 * حالة مؤشر الحصة عن بعد: أخضر (جارية)، برتقالي (تبدأ خلال أقل من ساعة)، أحمر (انتهت مؤخراً).
 */
export function computeLiveSessionIndicator(
  nowMs: number,
  rows: LiveSessionEventRow[],
): { indicator: LiveSessionIndicator; liveSlug: string } | null {
  const list = rows
    .filter(isOnlineClass)
    .map((e) => {
      const start = new Date(e.starts_at).getTime()
      const end = new Date(e.ends_at).getTime()
      return { e, start, end }
    })
    .filter((x) => x.end > x.start && !Number.isNaN(x.start) && !Number.isNaN(x.end))
    .sort((a, b) => a.start - b.start)

  const now = nowMs

  const inProgress = list.find((x) => x.start <= now && now < x.end)
  if (inProgress) {
    const slug = slugOf(inProgress.e)
    if (!slug) return null
    return { indicator: { kind: 'green', label: 'بدأت الحصة' }, liveSlug: slug }
  }

  const upcomingSoon = list.find((x) => now < x.start && x.start - now <= HOUR_MS)
  if (upcomingSoon) {
    const slug = slugOf(upcomingSoon.e)
    if (!slug) return null
    return { indicator: { kind: 'orange', label: 'بقي أقل من ساعة' }, liveSlug: slug }
  }

  const recentlyEnded = list
    .filter((x) => x.end <= now && now - x.end <= RED_WINDOW_MS)
    .sort((a, b) => b.end - a.end)[0]
  if (recentlyEnded) {
    const slug = slugOf(recentlyEnded.e)
    if (!slug) return null
    return { indicator: { kind: 'red', label: 'انتهت الحصة' }, liveSlug: slug }
  }

  return null
}

export async function fetchLiveSessionEventsForTeacher(
  client: SupabaseClient,
  workspaceId: string,
  userId: string,
): Promise<LiveSessionEventRow[]> {
  const { past, future } = windowBounds()

  const { data: owned, error: oErr } = await client
    .from('schedule_events')
    .select(SELECT_EVENTS)
    .eq('workspace_id', workspaceId)
    .neq('status', 'cancelled')
    .lt('starts_at', future)
    .gt('ends_at', past)

  if (oErr) {
    console.warn('liveSessionHeader teacher owned', oErr.message)
    return []
  }

  const { data: staffRows } = await client
    .from('group_staff')
    .select('group_id')
    .eq('teacher_id', userId)
    .eq('status', 'active')

  const linkedIds = [...new Set((staffRows ?? []).map((r) => r.group_id as string))].filter(Boolean)
  let linked: LiveSessionEventRow[] = []
  if (linkedIds.length > 0) {
    const { data: linkedData, error: lErr } = await client
      .from('schedule_events')
      .select(SELECT_EVENTS)
      .in('group_id', linkedIds)
      .neq('status', 'cancelled')
      .lt('starts_at', future)
      .gt('ends_at', past)
    if (!lErr && linkedData) linked = linkedData as unknown as LiveSessionEventRow[]
  }

  const seen = new Set<string>()
  const merged: LiveSessionEventRow[] = []
  for (const r of [...(owned ?? []), ...linked]) {
    const row = r as unknown as LiveSessionEventRow
    if (seen.has(row.id)) continue
    seen.add(row.id)
    merged.push(row)
  }
  return merged
}

export async function fetchLiveSessionEventsForStudent(
  client: SupabaseClient,
  groupIds: string[],
): Promise<LiveSessionEventRow[]> {
  if (groupIds.length === 0) return []
  const { past, future } = windowBounds()
  const { data, error } = await client
    .from('schedule_events')
    .select(SELECT_EVENTS)
    .in('group_id', groupIds)
    .neq('status', 'cancelled')
    .lt('starts_at', future)
    .gt('ends_at', past)

  if (error) {
    console.warn('liveSessionHeader student', error.message)
    return []
  }
  return (data ?? []) as unknown as LiveSessionEventRow[]
}
