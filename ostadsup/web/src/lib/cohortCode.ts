import type { StudyLevel } from '../types'

const PREFIX: Record<StudyLevel, string> = {
  licence: 'LIS',
  master: 'MAS',
  doctorate: 'DOC',
}

export function studyLevelLabel(level: StudyLevel): string {
  switch (level) {
    case 'licence':
      return 'إجازة'
    case 'master':
      return 'ماستر'
    case 'doctorate':
      return 'دكتوراه'
    default:
      return level
  }
}

/** اقتراح رمز رسمي: بادئة + سنة + تسلسل + لاحقة اختيارية */
export function buildSuggestedCohortCode(
  level: StudyLevel,
  academicYear: string,
  sequence: number,
  suffix?: string,
): string {
  const p = PREFIX[level] ?? 'LIS'
  const y = academicYear.trim().replace(/\s+/g, '') || '????'
  const seq = String(Math.max(1, sequence)).padStart(2, '0')
  const suf = suffix?.trim() ? `-${suffix.trim()}` : ''
  return `${p}-${y}-${seq}${suf}`
}
