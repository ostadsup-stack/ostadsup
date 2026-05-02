import type { SupabaseClient } from '@supabase/supabase-js'

export const CAMPUS_WALL_POST_KINDS = [
  'admin_notice',
  'study_alert',
  'training_opportunity',
  'campus_event',
  'study_material',
  'achievement',
] as const

export type CampusWallPostKind = (typeof CAMPUS_WALL_POST_KINDS)[number]

export const CAMPUS_WALL_IMPORTANCE = ['normal', 'high', 'urgent'] as const
export type CampusWallImportance = (typeof CAMPUS_WALL_IMPORTANCE)[number]

export const CAMPUS_WALL_MODERATION = ['draft', 'pending', 'published', 'rejected'] as const
export type CampusWallModerationStatus = (typeof CAMPUS_WALL_MODERATION)[number]

export type CampusWallRole = 'admin' | 'teacher' | 'coordinator' | 'student'

export type CampusWallSettingsRow = {
  id: number
  write_roles: string[]
  comment_roles: string[]
  pin_roles: string[]
  delete_roles: string[]
  require_approval_roles: string[]
  extra_student_writer_ids: string[]
  updated_at: string
}

export type CampusWallAttachment = { url: string; name?: string | null }

export type CampusWallPostRow = {
  id: string
  college_id: string | null
  group_id: string | null
  author_id: string
  post_kind: CampusWallPostKind
  importance: CampusWallImportance
  title: string | null
  body: string
  attachments: CampusWallAttachment[]
  pinned: boolean
  moderation_status: CampusWallModerationStatus
  hidden_at: string | null
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export type CampusWallPostWithRelations = CampusWallPostRow & {
  college?: { id: string; name: string } | null
  group?: { id: string; group_name: string } | null
}

export type CampusWallStats = {
  post_count: number
  pending_count: number
  authorized_writer_count: number
  open_report_count: number
}

export type CampusWallCapabilities = {
  can_write: boolean
  can_comment: boolean
  can_pin: boolean
  can_delete_any: boolean
  effective_role: string
  is_admin: boolean
}

export async function fetchCampusWallCapabilities(
  supabase: SupabaseClient,
): Promise<{ caps: CampusWallCapabilities | null; error: string | null }> {
  const { data, error } = await supabase.rpc('campus_wall_my_capabilities')
  if (error) return { caps: null, error: error.message }
  const o = data as Record<string, unknown> | null
  if (!o) return { caps: null, error: null }
  return {
    caps: {
      can_write: Boolean(o.can_write),
      can_comment: Boolean(o.can_comment),
      can_pin: Boolean(o.can_pin),
      can_delete_any: Boolean(o.can_delete_any),
      effective_role: String(o.effective_role ?? ''),
      is_admin: Boolean(o.is_admin),
    },
    error: null,
  }
}

export function campusWallPostKindLabelAr(kind: CampusWallPostKind): string {
  const m: Record<CampusWallPostKind, string> = {
    admin_notice: 'إعلان إداري',
    study_alert: 'تنبيه دراسي',
    training_opportunity: 'فرصة تدريب أو نشاط',
    campus_event: 'حدث جامعي',
    study_material: 'مادة أو ملخص دراسي',
    achievement: 'إنجاز أو تكريم',
  }
  return m[kind] ?? kind
}

export function campusWallImportanceLabelAr(i: CampusWallImportance): string {
  if (i === 'urgent') return 'عاجل'
  if (i === 'high') return 'مهم'
  return 'عادي'
}

export function campusWallRoleLabelAr(role: string): string {
  const m: Record<string, string> = {
    admin: 'مدير النظام',
    teacher: 'أستاذ',
    coordinator: 'منسّق فوج',
    student: 'طالب',
  }
  return m[role] ?? role
}

export async function fetchCampusWallCollegeCount(supabase: SupabaseClient): Promise<number> {
  const { count, error } = await supabase.from('colleges').select('id', { count: 'exact', head: true })
  if (error) return 0
  return count ?? 0
}

export function campusWallTitleFromCollegeCount(collegeCount: number): 'حائط الجامعة' | 'حائط الكلية' {
  return collegeCount > 1 ? 'حائط الجامعة' : 'حائط الكلية'
}

function isMissingCampusWallRpcError(err: { message?: string; code?: string } | null): boolean {
  if (!err?.message && !err?.code) return false
  const m = (err.message ?? '').toLowerCase()
  return (
    err.code === 'PGRST202' ||
    err.code === '42883' ||
    m.includes('schema cache') ||
    m.includes('admin_campus_wall_stats') ||
    m.includes('campus_wall_my_capabilities')
  )
}

/** عند غياب الدالة في PostgREST / عدم تطبيق الهجرة بعد — إحصاءات تقريبية من الجداول */
async function fetchAdminCampusWallStatsFallback(supabase: SupabaseClient): Promise<{
  stats: CampusWallStats | null
  error: string | null
}> {
  const [posts, pend, rep] = await Promise.all([
    supabase.from('campus_wall_posts').select('id', { count: 'exact', head: true }).is('deleted_at', null),
    supabase
      .from('campus_wall_posts')
      .select('id', { count: 'exact', head: true })
      .is('deleted_at', null)
      .eq('moderation_status', 'pending'),
    supabase.from('campus_wall_reports').select('id', { count: 'exact', head: true }).eq('status', 'open'),
  ])
  const firstErr = posts.error ?? pend.error ?? rep.error
  if (firstErr) return { stats: null, error: firstErr.message }

  return {
    stats: {
      post_count: posts.count ?? 0,
      pending_count: pend.count ?? 0,
      authorized_writer_count: 0,
      open_report_count: rep.count ?? 0,
    },
    error: null,
  }
}

export async function fetchAdminCampusWallStats(supabase: SupabaseClient): Promise<{
  stats: CampusWallStats | null
  error: string | null
}> {
  const { data, error } = await supabase.rpc('admin_campus_wall_stats')
  if (!error && data != null) {
    const o = data as Record<string, unknown>
    return {
      stats: {
        post_count: Number(o.post_count ?? 0),
        pending_count: Number(o.pending_count ?? 0),
        authorized_writer_count: Number(o.authorized_writer_count ?? 0),
        open_report_count: Number(o.open_report_count ?? 0),
      },
      error: null,
    }
  }
  if (error && isMissingCampusWallRpcError(error)) {
    return fetchAdminCampusWallStatsFallback(supabase)
  }
  return { stats: null, error: error?.message ?? null }
}

export async function fetchCampusWallSettings(
  supabase: SupabaseClient,
): Promise<{ row: CampusWallSettingsRow | null; error: string | null }> {
  const { data, error } = await supabase.from('campus_wall_settings').select('*').eq('id', 1).maybeSingle()
  if (error) return { row: null, error: error.message }
  return { row: data as CampusWallSettingsRow, error: null }
}

export async function updateCampusWallSettings(
  supabase: SupabaseClient,
  patch: Partial<
    Pick<
      CampusWallSettingsRow,
      | 'write_roles'
      | 'comment_roles'
      | 'pin_roles'
      | 'delete_roles'
      | 'require_approval_roles'
      | 'extra_student_writer_ids'
    >
  >,
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('campus_wall_settings').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', 1)
  return { error: error?.message ?? null }
}

export type CampusWallPostFilters = {
  collegeId: string | null
  groupId: string | null
  postKind: CampusWallPostKind | null
  importance: CampusWallImportance | null
  moderation: CampusWallModerationStatus | 'all' | null
}

/** فلاتر افتراضية لجلب منشورات حائط الجامعة/الكلية للطالب */
export const EMPTY_CAMPUS_WALL_FILTERS: CampusWallPostFilters = {
  collegeId: null,
  groupId: null,
  postKind: null,
  importance: null,
  moderation: 'all',
}

export async function fetchCampusWallPosts(
  supabase: SupabaseClient,
  opts: { admin: boolean; filters: CampusWallPostFilters },
): Promise<{ rows: CampusWallPostWithRelations[]; error: string | null }> {
  let q = supabase
    .from('campus_wall_posts')
    .select(
      `
      id, college_id, group_id, author_id, post_kind, importance, title, body, attachments, pinned,
      moderation_status, hidden_at, deleted_at, created_at, updated_at,
      college:colleges ( id, name ),
      group:groups ( id, group_name )
    `,
    )
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(120)

  if (!opts.admin) {
    q = q.eq('moderation_status', 'published').is('hidden_at', null)
  } else if (opts.filters.moderation && opts.filters.moderation !== 'all') {
    q = q.eq('moderation_status', opts.filters.moderation)
  }

  if (opts.filters.collegeId) q = q.eq('college_id', opts.filters.collegeId)
  if (opts.filters.groupId) q = q.eq('group_id', opts.filters.groupId)
  if (opts.filters.postKind) q = q.eq('post_kind', opts.filters.postKind)
  if (opts.filters.importance) q = q.eq('importance', opts.filters.importance)

  const { data, error } = await q
  if (error) return { rows: [], error: error.message }

  const raw = (data as Record<string, unknown>[]) ?? []
  const rows: CampusWallPostWithRelations[] = raw.map((row) => {
    const college = normalizeOne(row.college as { id: string; name: string } | null)
    const group = normalizeOne(row.group as { id: string; group_name: string } | null)
    const attachments = Array.isArray(row.attachments) ? (row.attachments as CampusWallAttachment[]) : []
    return {
      ...(row as unknown as CampusWallPostRow),
      attachments,
      college: college ?? null,
      group: group ?? null,
    }
  })

  rows.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })

  return { rows, error: null }
}

export type CampusAdminWallPreview = {
  id: string
  title: string | null
  bodySnippet: string
  createdAt: string
  authorName: string | null
  postKind: CampusWallPostKind
}

/** أحدث إعلان إداري أو منشور من حساب مدير على حائط الجامعة/الكلية (للطالب). */
export async function fetchLatestCampusAdminWallPreview(
  supabase: SupabaseClient,
): Promise<{ preview: CampusAdminWallPreview | null; error: string | null }> {
  const { rows, error } = await fetchCampusWallPosts(supabase, {
    admin: false,
    filters: EMPTY_CAMPUS_WALL_FILTERS,
  })
  if (error) return { preview: null, error }
  const authorIds = [...new Set(rows.map((r) => r.author_id))].filter(Boolean)
  const { map: authorMap, error: mapErr } = await fetchProfilesByIds(supabase, authorIds)
  if (mapErr) return { preview: null, error: mapErr }

  const candidates = rows.filter((p) => {
    const role = authorMap[p.author_id]?.role
    return p.post_kind === 'admin_notice' || role === 'admin'
  })
  candidates.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  const p = candidates[0]
  if (!p) return { preview: null, error: null }

  const body = (p.body ?? '').trim()
  const snippet = body.length > 220 ? `${body.slice(0, 220)}…` : body
  return {
    preview: {
      id: p.id,
      title: p.title?.trim() ? p.title.trim() : null,
      bodySnippet: snippet,
      createdAt: p.created_at,
      authorName: authorMap[p.author_id]?.full_name?.trim() ?? null,
      postKind: p.post_kind,
    },
    error: null,
  }
}

function normalizeOne<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

export type AuthorProfileBrief = {
  id: string
  full_name: string
  role: string
}

export async function fetchProfilesByIds(
  supabase: SupabaseClient,
  ids: string[],
): Promise<{ map: Record<string, AuthorProfileBrief>; error: string | null }> {
  const uniq = [...new Set(ids)].filter(Boolean)
  if (uniq.length === 0) return { map: {}, error: null }
  const { data, error } = await supabase.from('profiles').select('id, full_name, role').in('id', uniq)
  if (error) return { map: {}, error: error.message }
  const map: Record<string, AuthorProfileBrief> = {}
  for (const r of (data as AuthorProfileBrief[]) ?? []) {
    map[r.id] = r
  }
  return { map, error: null }
}

export async function fetchCoordinatorUserIds(
  supabase: SupabaseClient,
  userIds: string[],
): Promise<Set<string>> {
  const uniq = [...new Set(userIds)].filter(Boolean)
  if (uniq.length === 0) return new Set()
  const { data } = await supabase
    .from('group_members')
    .select('user_id')
    .in('user_id', uniq)
    .eq('role_in_group', 'coordinator')
    .eq('status', 'active')
  const s = new Set<string>()
  for (const r of (data as { user_id: string }[]) ?? []) {
    s.add(r.user_id)
  }
  return s
}

/** دور العرض على البطاقة: منسّق يتقدّم على دور الملف الشخصي */
export function campusWallDisplayRole(p: AuthorProfileBrief, isCoordinator: boolean): CampusWallRole | string {
  if (p.role === 'admin') return 'admin'
  if (isCoordinator) return 'coordinator'
  if (p.role === 'teacher') return 'teacher'
  return 'student'
}

export async function fetchCampusWallComments(
  supabase: SupabaseClient,
  postId: string,
): Promise<{ rows: { id: string; author_id: string; body: string; created_at: string }[]; error: string | null }> {
  const { data, error } = await supabase
    .from('campus_wall_comments')
    .select('id, author_id, body, created_at')
    .eq('post_id', postId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(80)
  if (error) return { rows: [], error: error.message }
  return { rows: (data as { id: string; author_id: string; body: string; created_at: string }[]) ?? [], error: null }
}

export async function insertCampusWallReport(
  supabase: SupabaseClient,
  postId: string,
  reporterId: string,
  reason: string | null,
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('campus_wall_reports').insert({
    post_id: postId,
    reporter_id: reporterId,
    reason: reason?.trim() || null,
  })
  return { error: error?.message ?? null }
}
