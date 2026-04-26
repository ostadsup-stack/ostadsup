import type { SupabaseClient } from '@supabase/supabase-js'

export type ProfileRole = 'admin' | 'teacher' | 'student'

export type VerifyAdminRoleResult =
  | { ok: true; role: ProfileRole }
  | { ok: false; role: null; error: string | null }

/**
 * يقرأ دور المستخدم من جدول profiles عبر Supabase (مصدر الحقيقة لسياسات /admin).
 */
export async function verifyAdminRoleFromDb(
  client: SupabaseClient,
  userId: string,
): Promise<VerifyAdminRoleResult> {
  const { data, error } = await client.from('profiles').select('role').eq('id', userId).maybeSingle()

  if (error) return { ok: false, role: null, error: error.message }
  const row = data as { role: string } | null
  if (!row?.role) return { ok: false, role: null, error: null }

  if (row.role === 'admin' || row.role === 'teacher' || row.role === 'student') {
    return { ok: true, role: row.role }
  }
  return { ok: false, role: null, error: null }
}
