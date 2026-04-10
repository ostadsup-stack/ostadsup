import type { CSSProperties } from 'react'
import { pickContrastingForeground, rgbaFromHex } from './colorContrast'

/** يطابق الواجهة والهجرات (قيمة افتراضية عند غياب لون صالح). */
export const DEFAULT_GROUP_ACCENT = '#2563eb'

const HEX_RE = /^#[0-9A-Fa-f]{6}$/

export function normalizeGroupAccent(raw: string | null | undefined): string {
  const t = (raw ?? '').trim()
  if (HEX_RE.test(t)) return t
  return DEFAULT_GROUP_ACCENT
}

/** متغيرات CSS لحاوية `.page--cohort` (خلفية محايدة + تمييز بلون الفوج). */
export function cohortPageSurfaceStyle(accentHex: string): CSSProperties {
  const a = normalizeGroupAccent(accentHex)
  return {
    '--cohort-accent': a,
    '--cohort-accent-dim': rgbaFromHex(a, 0.06) ?? 'rgba(37,99,235,0.06)',
    '--cohort-accent-dim-strong': rgbaFromHex(a, 0.11) ?? 'rgba(37,99,235,0.11)',
    '--cohort-accent-border': rgbaFromHex(a, 0.3) ?? 'rgba(37,99,235,0.3)',
    '--cohort-accent-fg': pickContrastingForeground(a),
  } as CSSProperties
}

/** شريط جانبي بلون الفوج لعناصر قائمة المحادثات. */
export function cohortListLinkAccentStyle(accentHex: string): CSSProperties {
  const a = normalizeGroupAccent(accentHex)
  return {
    '--link-cohort-accent': a,
  } as CSSProperties
}
