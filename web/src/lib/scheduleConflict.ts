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

/** Same teacher overlapping two different groups without acknowledgement (DB trigger P0001). */
export function isTeacherCrossGroupOverlapViolation(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false
  if (err.code === 'P0001') return true
  const m = err.message ?? ''
  return m.includes('teacher_schedule_cross_group_overlap')
}

export function scheduleCrossGroupOverlapUserMessage(): string {
  return 'لا يُقبل حفظ الحصة في القاعدة دون موافقة صريحة: لديك حصة أخرى في نفس التوقيت في فوج مختلف. استخدم بطاقة التأكيد أو غيّر الوقت.'
}

export function scheduleExclusionUserMessage(): string {
  return 'هذا الموعد يتعارض مع حصة أخرى لنفس الفوج. لا يُقبل التسجيل إلا بموافقة صاحب الحصة: غيّر الوقت أو أرسل طلب موافقة من الزر أدناه؛ سيصل إشعار لزميلك ويقرّر من «طلبات الحصص».'
}

/** Session start is strictly before current instant (client clock). */
export function isScheduleStartInPast(starts: Date): boolean {
  return starts.getTime() < Date.now()
}

/** DB trigger when start time is in the past (P0002). */
export function isScheduleStartInPastViolation(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false
  if ((err.code ?? '').toUpperCase() === 'P0002') return true
  const m = err.message ?? ''
  return m.includes('schedule_event_start_in_past')
}

export function scheduleStartInPastUserMessage(): string {
  return 'لا يمكن حجز حصة في وقت قد مضى. اختر تاريخاً ووقتاً في المستقبل.'
}
