import type { SupabaseClient } from '@supabase/supabase-js'

/** أنواع الأحداث الظاهرة في لوحة «النشاطات الأخيرة» */
export type AdminActivityType = 'cohort_created' | 'invitation_sent' | 'post_published'

export type AdminActivityItem = {
  /** مفتاح فريد للعرض (يُبنى من مصدر السجل) */
  key: string
  type: AdminActivityType
  /** سطر رئيسي قصير */
  title: string
  /** تفصيلة ثانوية (بريد، مساحة، إلخ) */
  detail: string
  at: string
  href: string
}

const COHORT_LIMIT = 8
const INVITE_LIMIT = 8
const POST_LIMIT = 8
const MERGED_MAX = 18

function byDateDesc(a: AdminActivityItem, b: AdminActivityItem) {
  return new Date(b.at).getTime() - new Date(a.at).getTime()
}

/**
 * يجمع آخر العمليات من جداول الأفواج والدعوات والمنشورات (إعلانات المساحة)
 * ويرتّبها زمنياً — من دون جدول تدقيق منفصل.
 */
export async function fetchAdminRecentActivity(
  supabase: SupabaseClient,
): Promise<{ items: AdminActivityItem[]; error: string | null }> {
  const { data: adminRows, error: adminErr } = await supabase
    .from('profiles')
    .select('id')
    .eq('role', 'admin')
  if (adminErr) return { items: [], error: adminErr.message }
  const adminIds = (adminRows as { id: string }[] | null)?.map((a) => a.id) ?? []

  const [gRes, iRes] = await Promise.all([
    supabase
      .from('groups')
      .select('id, group_name, created_at')
      .order('created_at', { ascending: false })
      .limit(COHORT_LIMIT),
    supabase
      .from('app_invitations')
      .select('id, email, invited_role, created_at')
      .order('created_at', { ascending: false })
      .limit(INVITE_LIMIT),
  ])

  if (gRes.error) return { items: [], error: gRes.error.message }
  if (iRes.error) return { items: [], error: iRes.error.message }

  const pRes =
    adminIds.length === 0
      ? { data: [] as { id: string; title: string | null; created_at: string; workspace_id: string }[] | null, error: null }
      : await supabase
          .from('posts')
          .select('id, title, created_at, workspace_id, author_id')
          .eq('scope', 'workspace')
          .is('group_id', null)
          .is('deleted_at', null)
          .in('author_id', adminIds)
          .order('created_at', { ascending: false })
          .limit(POST_LIMIT)

  if (pRes.error) return { items: [], error: pRes.error.message }

  const out: AdminActivityItem[] = []

  for (const r of (gRes.data as { id: string; group_name: string; created_at: string }[] | null) ?? []) {
    out.push({
      key: `cohort:${r.id}`,
      type: 'cohort_created',
      title: 'إنشاء فوج',
      detail: r.group_name?.trim() || '—',
      at: r.created_at,
      href: '/admin/groups',
    })
  }

  for (const r of (iRes.data as { id: string; email: string; invited_role: string; created_at: string }[] | null) ??
    []) {
    const role = r.invited_role === 'teacher' ? 'أستاذ' : 'طالب'
    out.push({
      key: `invite:${r.id}`,
      type: 'invitation_sent',
      title: 'إرسال دعوة',
      detail: `${r.email} · ${role}`,
      at: r.created_at,
      href: '/admin/invitations',
    })
  }

  const postRows = (pRes.data as { id: string; title: string | null; created_at: string; workspace_id: string }[] | null) ?? []
  const wsIds = [...new Set(postRows.map((p) => p.workspace_id).filter(Boolean))]
  const wsNameById: Record<string, string> = {}
  if (wsIds.length > 0) {
    const { data: wRows } = await supabase.from('workspaces').select('id, display_name').in('id', wsIds)
    for (const w of (wRows as { id: string; display_name: string }[] | null) ?? []) {
      wsNameById[w.id] = w.display_name?.trim() || w.id
    }
  }

  for (const r of postRows) {
    out.push({
      key: `post:${r.id}`,
      type: 'post_published',
      title: 'نشر إعلان',
      detail: `${r.title?.trim() || '— بدون عنوان —'} · ${wsNameById[r.workspace_id] ?? '—'}`,
      at: r.created_at,
      href: '/admin/posts',
    })
  }

  out.sort(byDateDesc)
  return { items: out.slice(0, MERGED_MAX), error: null }
}

export function activityTypeLabel(t: AdminActivityType): string {
  if (t === 'cohort_created') return 'فوج'
  if (t === 'invitation_sent') return 'دعوة'
  return 'إعلان'
}
