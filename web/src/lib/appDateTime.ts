/** App-wide locale for user-visible dates and times. */
export const APP_LOCALE = 'ar-MA' as const

const pad2 = (n: number) => n.toString().padStart(2, '0')

/** Forces 24h output even when callers pass `dateStyle` / `timeStyle` (some engines ignore `hour12` for those). */
const time24: Intl.DateTimeFormatOptions = { hour12: false, hourCycle: 'h24' }

/** Date and time; always uses a 24-hour clock (no 11:59 pm / ص-م). */
export function formatAppDateTime(
  input: string | number | Date,
  options?: Intl.DateTimeFormatOptions,
): string {
  return new Date(input).toLocaleString(APP_LOCALE, { ...options, ...time24 })
}

/**
 * Time only, local `HH:mm` (e.g. 23:59) — not locale-dependent, so 12h never appears.
 * (The `options` arg is kept for call-site compatibility; hour/minute use fixed width.)
 */
export function formatAppTime(
  input: string | number | Date,
  _options?: Intl.DateTimeFormatOptions,
): string {
  const d = new Date(input)
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}
