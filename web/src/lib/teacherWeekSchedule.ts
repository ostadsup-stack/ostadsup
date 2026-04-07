import type { SupabaseClient } from '@supabase/supabase-js'
import type { ScheduleEvent } from '../types'

export const SCHEDULE_HOUR_START = 8
export const SCHEDULE_HOUR_END = 22
export const SCHEDULE_SLOT_PX = 36

export const SCHEDULE_DAY_LABELS = [
  'الاثنين',
  'الثلاثاء',
  'الأربعاء',
  'الخميس',
  'الجمعة',
  'السبت',
  'الأحد',
]

export type ScheduleWeekEventRow = ScheduleEvent & {
  groups: { group_name: string; accent_color?: string | null } | null
  status?: string
}

const TOTAL_MIN = (SCHEDULE_HOUR_END - SCHEDULE_HOUR_START) * 60
export const SCHEDULE_COL_HEIGHT = (SCHEDULE_HOUR_END - SCHEDULE_HOUR_START) * SCHEDULE_SLOT_PX

export function startOfMonday(d: Date): Date {
  const x = new Date(d)
  const dow = x.getDay()
  const diff = dow === 0 ? -6 : 1 - dow
  x.setDate(x.getDate() + diff)
  x.setHours(0, 0, 0, 0)
  return x
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

export function formatDayDate(d: Date): string {
  return d.toLocaleDateString('ar-MA', { day: 'numeric', month: 'short' })
}

export function sameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  )
}

function clipEvent(start: Date, end: Date): { topPct: number; heightPct: number } | null {
  const startMin = start.getHours() * 60 + start.getMinutes()
  const endMin = end.getHours() * 60 + end.getMinutes()
  const winStart = SCHEDULE_HOUR_START * 60
  const winEnd = SCHEDULE_HOUR_END * 60
  const top = Math.max(startMin, winStart)
  const bottom = Math.min(endMin, winEnd)
  if (bottom <= top) return null
  return {
    topPct: ((top - winStart) / TOTAL_MIN) * 100,
    heightPct: ((bottom - top) / TOTAL_MIN) * 100,
  }
}

function minutesSinceMidnight(d: Date): number {
  return d.getHours() * 60 + d.getMinutes()
}

export type PlacedScheduleEvent = {
  ev: ScheduleWeekEventRow
  topPct: number
  heightPct: number
  lane: number
  laneCount: number
}

export function assignScheduleLanes(dayEvents: ScheduleWeekEventRow[]): PlacedScheduleEvent[] {
  const items = dayEvents
    .map((ev) => {
      const s = new Date(ev.starts_at)
      const e = new Date(ev.ends_at)
      const geom = clipEvent(s, e)
      if (!geom) return null
      return { ev, s, e, ...geom }
    })
    .filter(Boolean) as {
      ev: ScheduleWeekEventRow
      s: Date
      e: Date
      topPct: number
      heightPct: number
    }[]

  items.sort((a, b) => a.s.getTime() - b.s.getTime())

  const laneEnds: number[] = []
  const placed: PlacedScheduleEvent[] = []

  for (const it of items) {
    const startM = minutesSinceMidnight(it.s)
    const endM = minutesSinceMidnight(it.e)
    let lane = 0
    while (lane < laneEnds.length && laneEnds[lane] > startM) {
      lane++
    }
    if (lane === laneEnds.length) {
      laneEnds.push(endM)
    } else {
      laneEnds[lane] = Math.max(laneEnds[lane], endM)
    }
    placed.push({ ...it, lane, laneCount: 0 })
  }

  const n = Math.max(1, laneEnds.length)
  for (const p of placed) {
    p.laneCount = n
  }

  return placed
}

export async function fetchTeacherWeekScheduleRows(
  supabase: SupabaseClient,
  userId: string,
  workspaceId: string,
  weekStart: Date,
  weekEnd: Date,
): Promise<{ rows: ScheduleWeekEventRow[]; error: string | null }> {
  const from = weekStart.toISOString()
  const to = weekEnd.toISOString()
  const { data: owned, error: oErr } = await supabase
    .from('schedule_events')
    .select('*, groups(group_name, accent_color)')
    .eq('workspace_id', workspaceId)
    .gte('starts_at', from)
    .lte('starts_at', to)
    .order('starts_at', { ascending: true })

  if (oErr) {
    return { rows: [], error: oErr.message }
  }

  const { data: staffRows } = await supabase
    .from('group_staff')
    .select('group_id')
    .eq('teacher_id', userId)
    .eq('status', 'active')

  const linkedIds = [...new Set((staffRows ?? []).map((r) => r.group_id as string))].filter((gid) => gid)

  let linked: ScheduleWeekEventRow[] = []
  if (linkedIds.length > 0) {
    const { data: linkedData, error: lErr } = await supabase
      .from('schedule_events')
      .select('*, groups(group_name, accent_color)')
      .in('group_id', linkedIds)
      .gte('starts_at', from)
      .lte('starts_at', to)
      .order('starts_at', { ascending: true })
    if (!lErr && linkedData) linked = linkedData as ScheduleWeekEventRow[]
  }

  const seen = new Set<string>()
  const merged: ScheduleWeekEventRow[] = []
  for (const r of [...(owned as ScheduleWeekEventRow[]), ...linked]) {
    if (seen.has(r.id)) continue
    seen.add(r.id)
    merged.push(r)
  }
  merged.sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
  return { rows: merged, error: null }
}
