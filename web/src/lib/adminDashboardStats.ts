import type { SupabaseClient } from '@supabase/supabase-js'

/** صفوف جداول الخطوة 3: teachers, students, simple_groups (مجموعات مبسّطة), publications */
export type AdminDashboardStatId = 'teachers' | 'students' | 'groups' | 'publications'

export type AdminDashboardCounts = Record<AdminDashboardStatId, number>

export const ADMIN_DASHBOARD_STAT_ROWS: readonly { id: AdminDashboardStatId; label: string }[] = [
  { id: 'teachers', label: 'الأساتذة' },
  { id: 'students', label: 'الطلاب' },
  { id: 'groups', label: 'المجموعات' },
  { id: 'publications', label: 'المنشورات' },
] as const

/**
 * يجلب عدد الصفوف من جداول Supabase (صلاحيات المدير عبر RLS).
 * «groups» = جدول simple_groups (اسم groups محجوز لجدول الأفواج في Ostadi).
 */
export async function fetchAdminDashboardCounts(
  supabase: SupabaseClient,
): Promise<{ counts: AdminDashboardCounts | null; error: string | null }> {
  const [teachersRes, studentsRes, groupsRes, publicationsRes] = await Promise.all([
    supabase.from('teachers').select('id', { count: 'exact', head: true }),
    supabase.from('students').select('id', { count: 'exact', head: true }),
    supabase.from('simple_groups').select('id', { count: 'exact', head: true }),
    supabase.from('publications').select('id', { count: 'exact', head: true }),
  ])

  const firstErr =
    teachersRes.error ?? studentsRes.error ?? groupsRes.error ?? publicationsRes.error
  if (firstErr) {
    return { counts: null, error: firstErr.message }
  }

  return {
    counts: {
      teachers: teachersRes.count ?? 0,
      students: studentsRes.count ?? 0,
      groups: groupsRes.count ?? 0,
      publications: publicationsRes.count ?? 0,
    },
    error: null,
  }
}
