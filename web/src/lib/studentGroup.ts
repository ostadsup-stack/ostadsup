import type { SupabaseClient } from '@supabase/supabase-js'
import type { Group } from '../types'

export type StudentMemberRow = {
  group_id: string
  role_in_group: string
  student_number: string | null
  display_name: string | null
  groups: Group | null
}

export async function fetchActiveStudentMemberships(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ rows: StudentMemberRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from('group_members')
    .select('group_id, role_in_group, student_number, display_name, groups(*)')
    .eq('user_id', userId)
    .eq('status', 'active')

  if (error) {
    return { rows: [], error: error.message }
  }
  const list = (data ?? []) as unknown as StudentMemberRow[]
  return { rows: list.filter((r) => r.groups), error: null }
}

/** Active student-role memberships only (for one-group rule UX). */
export function filterStudentRoleRows(rows: StudentMemberRow[]): StudentMemberRow[] {
  return rows.filter((r) => r.role_in_group === 'student')
}

export async function fetchWorkspaceSlug(
  supabase: SupabaseClient,
  workspaceId: string,
): Promise<string | null> {
  const { data, error } = await supabase.from('workspaces').select('slug').eq('id', workspaceId).maybeSingle()
  if (error || !data) return null
  return (data as { slug: string }).slug ?? null
}

/** أستاذ في الفوج مع رابط الصفحة العامة إن وُجدت مساحة باسم slug باسمه */
export type GroupTeacherPublicRow = {
  id: string
  full_name: string
  /** slug لمساحة يملكها هذا الأستاذ (الصفحة الرسمية على Ostadi) */
  own_public_slug: string | null
}

/**
 * قائمة أساتذة الفوج (مالك مساحة الفوج ثم group_staff) مع slug الصفحة العامة لكل مالك مساحة.
 * slug مساحة الفوج الحالية يُعاد منفصلاً لأنها قد تختلف عن مساحة أستاذ ضيف.
 */
export async function fetchGroupTeachersWithPublicSlugs(
  supabase: SupabaseClient,
  groupId: string,
): Promise<{
  teachers: GroupTeacherPublicRow[]
  cohortWorkspaceSlug: string | null
  error: string | null
}> {
  const { data: g, error: gErr } = await supabase.from('groups').select('workspace_id').eq('id', groupId).maybeSingle()
  if (gErr || !g) return { teachers: [], cohortWorkspaceSlug: null, error: gErr?.message ?? 'فوج غير موجود' }

  const workspaceId = (g as { workspace_id: string }).workspace_id
  const { data: wsRow, error: wsErr } = await supabase
    .from('workspaces')
    .select('slug, owner_teacher_id')
    .eq('id', workspaceId)
    .maybeSingle()

  if (wsErr || !wsRow) {
    return { teachers: [], cohortWorkspaceSlug: null, error: wsErr?.message ?? null }
  }

  const w = wsRow as { slug: string | null; owner_teacher_id: string }
  const cohortWorkspaceSlug = w.slug?.trim() || null
  const ownerId = w.owner_teacher_id

  const { data: ownerProf } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('id', ownerId)
    .maybeSingle()

  const { data: staffRows, error: stErr } = await supabase
    .from('group_staff')
    .select('teacher_id, profiles(id, full_name)')
    .eq('group_id', groupId)
    .eq('status', 'active')

  const list: { id: string; full_name: string }[] = []
  if (ownerProf) {
    const op = ownerProf as { id: string; full_name: string | null }
    list.push({ id: op.id, full_name: op.full_name?.trim() || 'أستاذ المساحة' })
  }
  if (!stErr && staffRows?.length) {
    for (const row of staffRows) {
      const tid = row.teacher_id as string
      if (tid === ownerId) continue
      const prof = row.profiles as { full_name?: string | null } | { full_name?: string | null }[] | null
      const p = Array.isArray(prof) ? prof[0] : prof
      const fn = p?.full_name?.trim() || 'أستاذ'
      list.push({ id: tid, full_name: fn })
    }
  }

  const teacherIds = list.map((t) => t.id)
  if (teacherIds.length === 0) {
    return { teachers: [], cohortWorkspaceSlug, error: null }
  }

  const slugByOwner = new Map<string, string>()
  const { data: ownedWs, error: owErr } = await supabase
    .from('workspaces')
    .select('owner_teacher_id, slug')
    .in('owner_teacher_id', teacherIds)
    .eq('status', 'active')

  if (!owErr && ownedWs?.length) {
    for (const row of ownedWs as { owner_teacher_id: string; slug: string | null }[]) {
      const oid = row.owner_teacher_id
      const s = row.slug?.trim()
      if (!s || slugByOwner.has(oid)) continue
      slugByOwner.set(oid, s)
    }
  }

  const teachers: GroupTeacherPublicRow[] = list.map((t) => ({
    id: t.id,
    full_name: t.full_name,
    own_public_slug: slugByOwner.get(t.id) ?? (t.id === ownerId ? cohortWorkspaceSlug : null),
  }))

  return { teachers, cohortWorkspaceSlug, error: null }
}

const STUDY_LEVEL_AR: Record<string, string> = {
  licence: 'إجازة',
  master: 'ماستر',
  doctorate: 'دكتوراه',
}

/** تسمية عربية لمستوى الدراسة من عمود groups.study_level */
export function formatStudyLevel(level: string | null | undefined): string {
  if (level == null || level === '') return '—'
  return STUDY_LEVEL_AR[level] ?? level
}
