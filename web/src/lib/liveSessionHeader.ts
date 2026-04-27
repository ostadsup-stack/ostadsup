import type { SupabaseClient } from '@supabase/supabase-js'

export type LiveSessionIndicatorKind = 'green' | 'orange' | 'red'

export type LiveSessionIndicator = {
  kind: LiveSessionIndicatorKind
  label: string
  /** برتقالي: إظهار زر «ادخل إلى البث» (وقت الحصة وبانتظار بدء البث فقط، لا للحصة القادمة) */
  showEnterBroadcastCta?: boolean
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
  subject_name?: string | null
  location?: string | null
  meeting_link?: string | null
  live_started_at?: string | null
  /** PostgREST قد يعيد كائناً أو مصفوفة حسب الإصدار */
  workspaces: { slug: string } | { slug: string }[] | null
  groups?: { group_name: string | null } | { group_name: string | null }[] | null
}

const HOUR_MS = 60 * 60 * 1000
const RED_WINDOW_MS = 10 * 60 * 1000

/** أعمدة فقط — بدون تضمين PostgREST حتى لا يفشل الطلب كله بسبب علاقات أو RLS على الجداول المرتبطة */
const SELECT_EVENTS_COLUMNS =
  'id, workspace_id, group_id, starts_at, ends_at, status, event_type, mode, subject_name, location, meeting_link, live_started_at'

/**
 * يكمّل slug المساحة واسم الفوج باستعلامين دفعيّين (بديل آمن لتضمين workspaces/groups على schedule_events).
 */
export async function enrichScheduleEventRowsForHeader(
  client: SupabaseClient,
  rows: LiveSessionEventRow[],
): Promise<LiveSessionEventRow[]> {
  if (rows.length === 0) return rows
  const wsIds = [...new Set(rows.map((r) => r.workspace_id).filter(Boolean))]
  const gIds = [...new Set(rows.map((r) => r.group_id).filter(Boolean))]

  let wsData: { id: string; slug: string }[] = []
  if (wsIds.length > 0) {
    const { data, error } = await client.from('workspaces').select('id, slug').in('id', wsIds)
    if (error) console.warn('liveSessionHeader enrich workspaces', error.message)
    else wsData = (data ?? []) as { id: string; slug: string }[]
  }
  let gData: { id: string; group_name: string | null }[] = []
  if (gIds.length > 0) {
    const { data, error } = await client.from('groups').select('id, group_name').in('id', gIds)
    if (error) console.warn('liveSessionHeader enrich groups', error.message)
    else gData = (data ?? []) as { id: string; group_name: string | null }[]
  }

  const slugByWs = new Map<string, string>()
  for (const w of wsData) {
    const s = w.slug?.trim()
    if (s) slugByWs.set(w.id, s)
  }
  const nameByG = new Map<string, string | null>()
  for (const g of gData) {
    nameByG.set(g.id, g.group_name)
  }

  return rows.map((r) => ({
    ...r,
    workspaces: slugByWs.has(r.workspace_id) ? { slug: slugByWs.get(r.workspace_id)! } : null,
    groups: nameByG.has(r.group_id) ? { group_name: nameByG.get(r.group_id) ?? null } : null,
  }))
}

function windowBounds() {
  const now = Date.now()
  const past = new Date(now - 3 * 60 * 60 * 1000).toISOString()
  const future = new Date(now + 25 * 60 * 60 * 1000).toISOString()
  return { past, future }
}

function isClassEvent(e: LiveSessionEventRow): boolean {
  if ((e.status ?? 'planned') === 'cancelled') return false
  return (e.event_type ?? 'class') === 'class'
}

/** يتوافق مع عمود mode النصي حتى لا تُستبعد الحصص إن وُجدت مسافات أو اختلاف طفيف */
function normalizeScheduleMode(mode: string | null | undefined): 'online' | 'on_site' | null {
  const m = String(mode ?? '')
    .trim()
    .toLowerCase()
  if (m === 'online') return 'online'
  if (m === 'on_site' || m === 'onsite' || m === 'on-site') return 'on_site'
  return null
}

/**
 * إن كان mode ناقصاً أو غير متوقع في DB نستنتج من رابط الاجتماع أو مكان الحضور حتى لا تُستبعد الحصة من الرأس.
 */
function resolvedScheduleMode(e: LiveSessionEventRow): 'online' | 'on_site' | null {
  const n = normalizeScheduleMode(e.mode)
  if (n) return n
  const link = e.meeting_link?.trim()
  if (link && link.length > 0) return 'online'
  const loc = e.location?.trim()
  if (loc && loc.length > 0) return 'on_site'
  return null
}

function groupNameOf(e: LiveSessionEventRow): string | null {
  const g = e.groups
  const raw = Array.isArray(g) ? g[0]?.group_name : g?.group_name
  const s = raw?.trim()
  return s && s.length > 0 ? s : null
}

/** سطر عرض: المادة و/أو اسم الفوج */
export function sessionSummaryFromEvent(e: LiveSessionEventRow): string | null {
  const sub = e.subject_name?.trim()
  const gn = groupNameOf(e)
  if (sub && gn) return `${sub} · ${gn}`
  return sub || gn || null
}

function slugOf(e: LiveSessionEventRow): string | null {
  const w = e.workspaces
  const raw = Array.isArray(w) ? w[0]?.slug : w?.slug
  const s = raw?.trim()
  return s && s.length > 0 ? s : null
}

function meetingLinkOf(e: LiveSessionEventRow): string | null {
  const m = e.meeting_link?.trim()
  return m && m.length > 0 ? m : null
}

export type SessionStatus = 'upcoming' | 'live' | 'ended' | 'none'

export function getSessionStatus(
  session: { start_time: string; end_time: string },
  nowMs: number,
): SessionStatus {
  const start = new Date(session.start_time).getTime()
  const end = new Date(session.end_time).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 'none'

  const diffToStart = start - nowMs

  if (diffToStart <= HOUR_MS && diffToStart > 0) return 'upcoming'
  if (nowMs >= start && nowMs <= end) return 'live'
  if (nowMs > end && nowMs <= end + RED_WINDOW_MS) return 'ended'
  if (diffToStart > HOUR_MS || nowMs > end + RED_WINDOW_MS) return 'none'
  return 'none'
}

export type ComputedLiveSession = {
  sessionMode: 'online' | 'on_site'
  status: Exclude<SessionStatus, 'none'>
  indicator: LiveSessionIndicator
  /** للحصص عن بعد (روابط البث). للحضوري غالباً null */
  liveSlug: string | null
  meetingLink: string | null
  scheduleEventId: string
  groupId: string
  sessionSummary: string | null
}

type TimedRow = {
  e: LiveSessionEventRow
  start: number
  end: number
  mode: 'online' | 'on_site'
  status: Exclude<SessionStatus, 'none'>
  distanceToNow: number
}

function buildTimedList(rows: LiveSessionEventRow[], nowMs: number): TimedRow[] {
  return rows
    .filter(isClassEvent)
    .map((e) => {
      const start = new Date(e.starts_at).getTime()
      const end = new Date(e.ends_at).getTime()
      const mode = resolvedScheduleMode(e)
      if (!mode) return null
      const status = getSessionStatus({ start_time: e.starts_at, end_time: e.ends_at }, nowMs)
      if (status === 'none') return null
      const distanceToNow =
        status === 'live' ? 0 : status === 'upcoming' ? Math.max(0, start - nowMs) : Math.max(0, nowMs - end)
      return { e, start, end, mode, status, distanceToNow }
    })
    .filter((x): x is TimedRow => Boolean(x))
    .filter((x) => x.end > x.start && !Number.isNaN(x.start) && !Number.isNaN(x.end))
    .sort((a, b) => a.start - b.start)
}

export function computeLiveSessionIndicator(nowMs: number, rows: LiveSessionEventRow[]): ComputedLiveSession | null {
  const list = buildTimedList(rows, nowMs)
  if (list.length === 0) return null

  const statusPriority: Record<Exclude<SessionStatus, 'none'>, number> = {
    live: 0,
    upcoming: 1,
    ended: 2,
  }

  list.sort((a, b) => {
    if (a.distanceToNow !== b.distanceToNow) return a.distanceToNow - b.distanceToNow
    if (statusPriority[a.status] !== statusPriority[b.status]) return statusPriority[a.status] - statusPriority[b.status]
    return a.start - b.start
  })

  const best = list[0]
  const indicator: LiveSessionIndicator =
    best.status === 'upcoming'
      ? { kind: 'orange', label: 'الحصة القادمة خلال أقل من ساعة' }
      : best.status === 'live'
        ? { kind: 'green', label: 'البث جاري الآن' }
        : { kind: 'red', label: 'انتهت الحصة' }

  return {
    sessionMode: best.mode,
    status: best.status,
    indicator,
    liveSlug: slugOf(best.e),
    meetingLink: best.mode === 'online' ? meetingLinkOf(best.e) : null,
    scheduleEventId: best.e.id,
    groupId: best.e.group_id,
    sessionSummary: sessionSummaryFromEvent(best.e),
  }
}

export async function fetchLiveSessionEventsForTeacher(
  client: SupabaseClient,
  workspaceId: string,
  userId: string,
): Promise<LiveSessionEventRow[]> {
  const { past, future } = windowBounds()

  const { data: owned, error: oErr } = await client
    .from('schedule_events')
    .select(SELECT_EVENTS_COLUMNS)
    .eq('workspace_id', workspaceId)
    .neq('status', 'cancelled')
    .lt('starts_at', future)
    .gt('ends_at', past)

  if (oErr) {
    console.warn('liveSessionHeader teacher owned', oErr.message)
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
      .select(SELECT_EVENTS_COLUMNS)
      .in('group_id', linkedIds)
      .neq('status', 'cancelled')
      .lt('starts_at', future)
      .gt('ends_at', past)
    if (lErr) console.warn('liveSessionHeader teacher linked', lErr.message)
    else if (linkedData) linked = linkedData as unknown as LiveSessionEventRow[]
  }

  const seen = new Set<string>()
  const merged: LiveSessionEventRow[] = []
  for (const r of [...(owned ?? []), ...linked]) {
    const row = r as unknown as LiveSessionEventRow
    if (seen.has(row.id)) continue
    seen.add(row.id)
    merged.push(row)
  }

  if (merged.length === 0) {
    const { data: wg, error: wgErr } = await client.from('groups').select('id').eq('workspace_id', workspaceId)
    if (!wgErr && wg && wg.length > 0) {
      const gids = wg.map((g) => g.id as string)
      const { data: byGroup, error: bgErr } = await client
        .from('schedule_events')
        .select(SELECT_EVENTS_COLUMNS)
        .in('group_id', gids)
        .neq('status', 'cancelled')
        .lt('starts_at', future)
        .gt('ends_at', past)
      if (bgErr) console.warn('liveSessionHeader teacher fallback by groups', bgErr.message)
      else if (byGroup?.length)
        return byGroup as unknown as LiveSessionEventRow[]
    }
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
    .select(SELECT_EVENTS_COLUMNS)
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
