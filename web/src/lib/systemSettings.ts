import type { SupabaseClient } from '@supabase/supabase-js'

export const SYSTEM_SETTINGS_ROW_ID = 1 as const

export type SystemSettingsRow = {
  id: number
  voting_enabled: boolean
  attendance_enabled: boolean
  teacher_linking_enabled: boolean
  updated_at: string
}

export async function fetchSystemSettings(
  supabase: SupabaseClient,
): Promise<{ row: SystemSettingsRow | null; error: string | null }> {
  const { data, error } = await supabase.from('settings').select('*').eq('id', SYSTEM_SETTINGS_ROW_ID).maybeSingle()

  if (error) return { row: null, error: error.message }
  return { row: data as SystemSettingsRow | null, error: null }
}

export async function upsertSystemSettings(
  supabase: SupabaseClient,
  patch: Partial<
    Pick<SystemSettingsRow, 'voting_enabled' | 'attendance_enabled' | 'teacher_linking_enabled'>
  >,
): Promise<{ error: string | null }> {
  const now = new Date().toISOString()
  const { data: existing } = await supabase.from('settings').select('id').eq('id', SYSTEM_SETTINGS_ROW_ID).maybeSingle()

  if (!existing) {
    const { error } = await supabase.from('settings').insert({
      id: SYSTEM_SETTINGS_ROW_ID,
      voting_enabled: patch.voting_enabled ?? false,
      attendance_enabled: patch.attendance_enabled ?? false,
      teacher_linking_enabled: patch.teacher_linking_enabled ?? false,
      updated_at: now,
    })
    return { error: error?.message ?? null }
  }

  const { error } = await supabase
    .from('settings')
    .update({ ...patch, updated_at: now })
    .eq('id', SYSTEM_SETTINGS_ROW_ID)

  return { error: error?.message ?? null }
}
