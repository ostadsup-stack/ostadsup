/** Default slot length when the user picks a start time without an end time. */
export const DEFAULT_SCHEDULE_DURATION_MIN = 120

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

const digitOnly4 = (raw: string) => raw.replace(/\D/g, '').slice(0, 4)

/**
 * For `type="text"` time fields: keep only up to 4 digits and format as H:MM, HH, or HH:MM.
 * (Avoids `input type="time"`, which follows OS 12h in Firefox, etc.)
 */
export function formatHhmmDigitsInput(raw: string): string {
  const d = digitOnly4(raw)
  if (d.length === 0) return ''
  if (d.length <= 2) return d
  return d.slice(0, 2) + ':' + d.slice(2, 4)
}

/**
 * On blur: accept `HH:mm`, 4 digits like `2104`, `930` (9:30), `21` (21:00), etc. → normalized `HH:mm` or return trimmed input if not parseable.
 */
export function commitHhmmText(s: string): string {
  const t = s.trim()
  if (!t) return ''
  const p0 = parseClock(t)
  if (p0) return `${pad2(p0.h)}:${pad2(p0.m)}`
  const d = t.replace(/\D/g, '')
  if (d.length === 4) {
    const w = d.slice(0, 2) + ':' + d.slice(2, 4)
    const p = parseClock(w)
    if (p) return `${pad2(p.h)}:${pad2(p.m)}`
  }
  if (d.length === 3) {
    const a = d[0]! + ':' + d.slice(1, 3)
    const p = parseClock(a)
    if (p) return `${pad2(p.h)}:${pad2(p.m)}`
  }
  if (d.length === 2) {
    const p = parseClock(d + ':00')
    if (p) return `${pad2(p.h)}:${pad2(p.m)}`
  }
  if (d.length === 1) {
    const p = parseClock('0' + d + ':00')
    if (p) return `${pad2(p.h)}:${pad2(p.m)}`
  }
  return t
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
