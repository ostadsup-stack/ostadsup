import type { SupabaseClient } from '@supabase/supabase-js'
import type { Material } from '../types'

export type MaterialAuthorProfile = { full_name: string | null; role: string }

export type MaterialWithCreator = Material & {
  created_by: string
  status?: string
  profiles?: MaterialAuthorProfile | MaterialAuthorProfile[] | null
}

export type PeerPostRow = {
  id: string
  title: string | null
  content: string
  created_at: string
  author_id: string
  post_type?: string | null
  profiles?: MaterialAuthorProfile | MaterialAuthorProfile[] | null
}

function singleProfile(p: unknown): MaterialAuthorProfile | null {
  if (p == null) return null
  if (Array.isArray(p)) {
    const x = p[0]
    return x && typeof x === 'object' && 'role' in x ? (x as MaterialAuthorProfile) : null
  }
  if (typeof p === 'object' && 'role' in p) return p as MaterialAuthorProfile
  return null
}

export function materialAuthorName(m: MaterialWithCreator): string {
  const pr = singleProfile(m.profiles)
  return pr?.full_name?.trim() || '—'
}

export function postAuthorName(p: PeerPostRow): string {
  const pr = singleProfile(p.profiles)
  return pr?.full_name?.trim() || '—'
}

/** مالك المساحة + أساتذة الطاقم النشطون في الفوج (لتصفية مكتبة الأساتذة ومحتوى الآخرين). */
export async function fetchTeacherIdsForStudentGroup(
  supabase: SupabaseClient,
  groupId: string,
): Promise<{ workspaceId: string; teacherIds: string[]; error: string | null }> {
  const { data: g, error: gErr } = await supabase.from('groups').select('workspace_id').eq('id', groupId).maybeSingle()
  if (gErr || !g) return { workspaceId: '', teacherIds: [], error: gErr?.message ?? 'تعذر تحميل الفوج' }

  const workspaceId = (g as { workspace_id: string }).workspace_id
  const { data: w, error: wErr } = await supabase
    .from('workspaces')
    .select('owner_teacher_id')
    .eq('id', workspaceId)
    .maybeSingle()
  if (wErr || !w) return { workspaceId, teacherIds: [], error: wErr?.message ?? 'تعذر تحميل المساحة' }

  const ownerId = (w as { owner_teacher_id: string }).owner_teacher_id
  const { data: staffRows, error: sErr } = await supabase
    .from('group_staff')
    .select('teacher_id')
    .eq('group_id', groupId)
    .eq('status', 'active')

  const ids = new Set<string>()
  if (ownerId) ids.add(ownerId)
  if (!sErr) {
    for (const row of staffRows ?? []) {
      const tid = (row as { teacher_id: string }).teacher_id
      if (tid) ids.add(tid)
    }
  }

  if (ids.size === 0) {
    return {
      workspaceId,
      teacherIds: [],
      error: sErr?.message ?? 'تعذر تحديد أساتذة الفوج.',
    }
  }
  return { workspaceId, teacherIds: [...ids], error: null }
}

const MAT_SELECT = '*, profiles:profiles!materials_created_by_fkey(full_name, role)'

/**
 * مواد مكتبة الأساتذة (عموم المساحة + مواد الفوج التي رفعها أستاذ)؛ ومواد/منشورات المنسق والطلاب.
 */
export async function fetchStudentMaterialsFeed(
  supabase: SupabaseClient,
  groupId: string,
): Promise<{
  teacherMaterials: MaterialWithCreator[]
  peerMaterials: MaterialWithCreator[]
  peerPosts: PeerPostRow[]
  error: string | null
}> {
  const { workspaceId, teacherIds, error: tidErr } = await fetchTeacherIdsForStudentGroup(supabase, groupId)
  if (tidErr) return { teacherMaterials: [], peerMaterials: [], peerPosts: [], error: tidErr }
  if (!workspaceId || teacherIds.length === 0) {
    return {
      teacherMaterials: [],
      peerMaterials: [],
      peerPosts: [],
      error: 'تعذر تحديد أساتذة الفوج (مالك المساحة أو الطاقم).',
    }
  }

  const teacherSet = new Set(teacherIds)

  const [libRes, groupMatRes, postsRes] = await Promise.all([
    supabase
      .from('materials')
      .select(MAT_SELECT)
      .eq('workspace_id', workspaceId)
      .eq('audience_scope', 'workspace_public')
      .is('group_id', null)
      .eq('status', 'published')
      .in('created_by', teacherIds)
      .order('created_at', { ascending: false }),
    supabase
      .from('materials')
      .select(MAT_SELECT)
      .eq('group_id', groupId)
      .eq('audience_scope', 'group')
      .eq('status', 'published')
      .order('created_at', { ascending: false }),
    supabase
      .from('posts')
      .select('id, title, content, created_at, author_id, post_type, profiles:profiles!posts_author_id_fkey(full_name, role)')
      .eq('group_id', groupId)
      .eq('scope', 'group')
      .is('deleted_at', null)
      .is('hidden_at', null)
      .order('created_at', { ascending: false })
      .limit(120),
  ])

  const err = libRes.error?.message ?? groupMatRes.error?.message ?? postsRes.error?.message ?? null
  if (err) return { teacherMaterials: [], peerMaterials: [], peerPosts: [], error: err }

  const groupMats = (groupMatRes.data ?? []) as MaterialWithCreator[]
  const teacherGroupMats = groupMats.filter((m) => teacherSet.has(m.created_by))
  const peerMaterials = groupMats.filter((m) => !teacherSet.has(m.created_by))

  const teacherLib = (libRes.data ?? []) as MaterialWithCreator[]
  const teacherMaterials = [...teacherLib, ...teacherGroupMats].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )

  const peerPosts = ((postsRes.data ?? []) as PeerPostRow[]).filter((p) => !teacherSet.has(p.author_id))

  return { teacherMaterials, peerMaterials, peerPosts, error: null }
}
