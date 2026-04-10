import type { SupabaseClient } from '@supabase/supabase-js'
import type { ScheduleEvent } from '../types'
import { scheduleIntervalsOverlap } from './scheduleConflict'

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

export type SameGroupOverlapPair = {
  idA: string
  idB: string
  groupId: string
  groupName: string | null
  sameTeacher: boolean
}

export type CrossGroupOverlapPair = {
  idA: string
  idB: string
  gA: string
  gB: string
  nameA: string | null
  nameB: string | null
  createdAtA: string
  createdAtB: string
}

/** تحليل تداخلات الأسبوع: نفس الفوج، أو فوجان مختلفان على نفس اليوم المحلي */
export function analyzeScheduleWeekOverlaps(rows: ScheduleWeekEventRow[]): {
  sameGroupTimeOverlap: boolean
  sameGroupPairs: SameGroupOverlapPair[]
  crossGroupSameDayPairs: CrossGroupOverlapPair[]
} {
  const active = rows.filter((r) => r.status !== 'cancelled')
  const sameGroupPairs: SameGroupOverlapPair[] = []
  const crossGroupSameDayPairs: CrossGroupOverlapPair[] = []
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i]
      const b = active[j]
      const s1 = new Date(a.starts_at)
      const e1 = new Date(a.ends_at)
      const s2 = new Date(b.starts_at)
      const e2 = new Date(b.ends_at)
      if (!scheduleIntervalsOverlap(s1, e1, s2, e2)) continue
      if (a.group_id === b.group_id) {
        sameGroupPairs.push({
          idA: a.id,
          idB: b.id,
          groupId: a.group_id,
          groupName: a.groups?.group_name ?? null,
          sameTeacher: a.created_by === b.created_by,
        })
        if (sameGroupPairs.length >= 20) break
      } else if (sameLocalDay(s1, s2) && crossGroupSameDayPairs.length < 20) {
        crossGroupSameDayPairs.push({
          idA: a.id,
          idB: b.id,
          gA: a.group_id,
          gB: b.group_id,
          nameA: a.groups?.group_name ?? null,
          nameB: b.groups?.group_name ?? null,
          createdAtA: a.created_at ?? a.starts_at,
          createdAtB: b.created_at ?? b.starts_at,
        })
      }
    }
    if (sameGroupPairs.length >= 20) break
  }
  return {
    sameGroupTimeOverlap: sameGroupPairs.length > 0,
    sameGroupPairs,
    crossGroupSameDayPairs,
  }
}

export type ScheduleWeekOverlapAudit = ReturnType<typeof analyzeScheduleWeekOverlaps>

export const emptyScheduleOverlapAudit: ScheduleWeekOverlapAudit = {
  sameGroupTimeOverlap: false,
  sameGroupPairs: [],
  crossGroupSameDayPairs: [],
}

/** صفّان فعّالان لنفس الفوج يتداخلان زمنياً (بيانات قديمة أو قبل تطبيق القيود) */
export function detectSameGroupActiveOverlaps(rows: ScheduleWeekEventRow[]): boolean {
  return analyzeScheduleWeekOverlaps(rows).sameGroupTimeOverlap
}

export async function fetchTeacherWeekScheduleRows(
  supabase: SupabaseClient,
  userId: string,
  workspaceId: string,
  weekStart: Date,
  weekEnd: Date,
): Promise<{
  rows: ScheduleWeekEventRow[]
  error: string | null
  sameGroupTimeOverlap: boolean
  overlapAudit: ReturnType<typeof analyzeScheduleWeekOverlaps>
}> {
  const from = weekStart.toISOString()
  const to = weekEnd.toISOString()
  const { data: owned, error: oErr } = await supabase
    .from('schedule_events')
    .select('*, groups(group_name, accent_color), profiles:profiles!schedule_events_created_by_fkey(full_name)')
    .eq('workspace_id', workspaceId)
    .neq('status', 'cancelled')
    .gte('starts_at', from)
    .lte('starts_at', to)
    .order('starts_at', { ascending: true })

  if (oErr) {
    return {
      rows: [],
      error: oErr.message,
      sameGroupTimeOverlap: false,
      overlapAudit: { sameGroupTimeOverlap: false, sameGroupPairs: [], crossGroupSameDayPairs: [] },
    }
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
      .select('*, groups(group_name, accent_color), profiles:profiles!schedule_events_created_by_fkey(full_name)')
      .in('group_id', linkedIds)
      .neq('status', 'cancelled')
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
  const overlapAudit = analyzeScheduleWeekOverlaps(merged)
  const sameGroupTimeOverlap = overlapAudit.sameGroupTimeOverlap

  return { rows: merged, error: null, sameGroupTimeOverlap, overlapAudit }
}
