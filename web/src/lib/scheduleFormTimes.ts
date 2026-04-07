/** Default slot length when the user picks a start time without an end time. */
export const DEFAULT_SCHEDULE_DURATION_MIN = 90

const pad2 = (n: number) => String(n).padStart(2, '0')

export function parseClock(hhmm: string): { h: number; m: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim())
  if (!m) return null
  const h = Number(m[1])
  const mi = Number(m[2])
  if (h < 0 || h > 23 || mi < 0 || mi > 59) return null
  return { h, m: mi }
}

export function clockToMinutes(hhmm: string): number | null {
  const p = parseClock(hhmm)
  return p ? p.h * 60 + p.m : null
}

export function minutesToClock(total: number): string {
  const t = ((total % (24 * 60)) + 24 * 60) % (24 * 60)
  const h = Math.floor(t / 60)
  const m = t % 60
  return `${pad2(h)}:${pad2(m)}`
}

export function addMinutesToClock(hhmm: string, deltaMin: number): string {
  const base = clockToMinutes(hhmm)
  if (base === null) return minutesToClock(deltaMin)
  return minutesToClock(base + deltaMin)
}

/** Local calendar date (YYYY-MM-DD) and HH:mm from an ISO timestamp. */
export function scheduleFieldsFromIso(startIso: string, endIso: string) {
  const ds = new Date(startIso)
  const de = new Date(endIso)
  const schedule_date = `${ds.getFullYear()}-${pad2(ds.getMonth() + 1)}-${pad2(ds.getDate())}`
  const start_time = `${pad2(ds.getHours())}:${pad2(ds.getMinutes())}`
  const end_time = `${pad2(de.getHours())}:${pad2(de.getMinutes())}`
  return { schedule_date, start_time, end_time }
}

/** When start time changes, keep duration if possible; else default slot length. */
export function nextEndAfterStartChange(
  prevStart: string,
  prevEnd: string,
  nextStart: string,
): string {
  if (!nextStart) return prevEnd
  if (!prevEnd) return addMinutesToClock(nextStart, DEFAULT_SCHEDULE_DURATION_MIN)
  if (!prevStart) return addMinutesToClock(nextStart, DEFAULT_SCHEDULE_DURATION_MIN)
  const sm = clockToMinutes(prevStart)
  const em = clockToMinutes(prevEnd)
  const ns = clockToMinutes(nextStart)
  if (sm === null || em === null || ns === null) {
    return addMinutesToClock(nextStart, DEFAULT_SCHEDULE_DURATION_MIN)
  }
  const d = em - sm
  if (d > 0) return minutesToClock(ns + d)
  return addMinutesToClock(nextStart, DEFAULT_SCHEDULE_DURATION_MIN)
}
