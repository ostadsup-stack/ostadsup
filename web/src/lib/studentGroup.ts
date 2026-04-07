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
