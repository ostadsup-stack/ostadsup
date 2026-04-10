import type { StudyLevel } from '../types'

/** تسمية المستوى الدراسي للعرض في قوائم الأفواج */
export function studyLevelLabelAr(level: StudyLevel | string | null | undefined): string {
  const l = String(level ?? '')
  if (l === 'licence') return 'إجازة'
  if (l === 'master') return 'ماستر'
  if (l === 'doctorate') return 'دكتوراه'
  return '—'
}

/** ISO bounds for the teacher's local calendar day (for RPC `teacher_group_list_summaries`). */
export function localTodayBoundsIso(): { p_today_start: string; p_today_end: string } {
  const n = new Date()
  const start = new Date(n.getFullYear(), n.getMonth(), n.getDate(), 0, 0, 0, 0)
  const end = new Date(n.getFullYear(), n.getMonth(), n.getDate(), 23, 59, 59, 999)
  return { p_today_start: start.toISOString(), p_today_end: end.toISOString() }
}

export type TeacherScheduleQuickGroup = {
  group_id: string
  group_name: string
  accent_color: string | null
}

/** Minimal fields from `teacher_group_list_summaries` for schedule quick links. */
export function mapRpcRowsToQuickGroups(raw: unknown): TeacherScheduleQuickGroup[] {
  const list = (raw as object[] | null) ?? []
  return list.map((row) => {
    const r = row as TeacherScheduleQuickGroup & { accent_color?: string | null }
    return {
      group_id: r.group_id,
      group_name: r.group_name,
      accent_color: r.accent_color ?? null,
    }
  })
}
