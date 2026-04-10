import type { ScheduleEvent } from '../types'

export function scheduleIntervalsOverlap(
  startA: Date,
  endA: Date,
  startB: Date,
  endB: Date,
): boolean {
  return startA.getTime() < endB.getTime() && endA.getTime() > startB.getTime()
}

/** Active = not cancelled; optional excludeEventId for edit flows */
export function findOverlappingScheduleEvents(
  events: ScheduleEvent[],
  rangeStart: Date,
  rangeEnd: Date,
  excludeEventId?: string | null,
): ScheduleEvent[] {
  return events.filter((ev) => {
    if (ev.status === 'cancelled') return false
    if (excludeEventId && ev.id === excludeEventId) return false
    const s = new Date(ev.starts_at)
    const e = new Date(ev.ends_at)
    return scheduleIntervalsOverlap(rangeStart, rangeEnd, s, e)
  })
}

export function scheduleEventCreatorLabel(ev: ScheduleEvent): string {
  const n = ev.profiles?.full_name?.trim()
  if (n) return n
  return 'أستاذ'
}

export function isPostgresExclusionViolation(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false
  if (err.code === '23P01') return true
  const m = (err.message ?? '').toLowerCase()
  return m.includes('schedule_events_no_group_overlap') || m.includes('exclusion')
}

export function scheduleExclusionUserMessage(): string {
  return 'هذا الموعد يتعارض مع حصة أخرى لنفس الفوج. غيّر الوقت أو أرسل طلباً لصاحب الحصة من «طلبات الحصص».'
}
