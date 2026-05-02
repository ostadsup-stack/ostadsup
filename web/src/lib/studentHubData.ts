import type { SupabaseClient } from '@supabase/supabase-js'

export type HubMessagePreview = {
  conversationId: string
  body: string
  createdAt: string
  headline: string
}

export type HubPostPinned = {
  id: string
  title: string | null
  content: string
  createdAt: string
  authorName: string | null
  scope: 'group' | 'workspace'
}

export type HubPostPerTeacher = {
  authorId: string
  authorName: string
  postId: string
  title: string | null
  contentPreview: string
  createdAt: string
  scope: 'group' | 'workspace'
}

/** معاينة منشور واحد من أستاذ (للرئيسية) */
export type HubTeacherPostBlurb = {
  postId: string
  authorId: string
  authorName: string
  title: string | null
  contentPreview: string
  createdAt: string
  scope: 'group' | 'workspace'
  postType: string
}

/** منشورات حائط الفوج من حسابات المنسقين في نفس الفوج */
export type HubCoordinatorAnnouncement = {
  id: string
  title: string | null
  content: string
  createdAt: string
  authorName: string | null
}

type ParticipantProfile = { full_name: string | null; role: string } | null

type PartRow = {
  conversation_id: string
  user_id: string
  profiles: ParticipantProfile
}

function singleProfile(p: unknown): ParticipantProfile {
  if (p == null) return null
  if (Array.isArray(p)) {
    const x = p[0]
    if (x && typeof x === 'object' && 'role' in x) {
      return x as { full_name: string | null; role: string }
    }
    return null
  }
  if (typeof p === 'object' && 'role' in p) {
    return p as { full_name: string | null; role: string }
  }
  return null
}

/** آخر رسالة: محادثة المنسق + محادثة لكل أستاذ (teacher_student) ضمن نفس الفوج */
export async function fetchStudentHubMessagePreviews(
  supabase: SupabaseClient,
  userId: string,
  groupId: string,
): Promise<{ coordinator: HubMessagePreview | null; teachers: HubMessagePreview[]; error: string | null }> {
  const { data: parts, error: pErr } = await supabase
    .from('conversation_participants')
    .select('conversation_id')
    .eq('user_id', userId)
  if (pErr) return { coordinator: null, teachers: [], error: pErr.message }
  const convIds = [...new Set((parts ?? []).map((p) => p.conversation_id as string))]
  if (convIds.length === 0) return { coordinator: null, teachers: [], error: null }

  const { data: convs, error: cErr } = await supabase
    .from('conversations')
    .select('id, conversation_type, subject, group_id')
    .in('id', convIds)
    .eq('group_id', groupId)

  if (cErr) return { coordinator: null, teachers: [], error: cErr.message }
  const convList = convs ?? []
  const filteredIds = convList.map((c) => c.id as string)
  if (filteredIds.length === 0) return { coordinator: null, teachers: [], error: null }

  const { data: messages, error: mErr } = await supabase
    .from('messages')
    .select('body, created_at, conversation_id')
    .in('conversation_id', filteredIds)
    .order('created_at', { ascending: false })
    .limit(400)

  if (mErr) return { coordinator: null, teachers: [], error: mErr.message }

  const lastByConv = new Map<string, { body: string; created_at: string }>()
  for (const m of messages ?? []) {
    const cid = m.conversation_id as string
    if (!lastByConv.has(cid)) {
      lastByConv.set(cid, { body: (m.body as string) ?? '', created_at: m.created_at as string })
    }
  }

  const { data: allParts, error: apErr } = await supabase
    .from('conversation_participants')
    .select('conversation_id, user_id, profiles(full_name, role)')
    .in('conversation_id', filteredIds)

  if (apErr) return { coordinator: null, teachers: [], error: apErr.message }

  const byConv = new Map<string, PartRow[]>()
  for (const raw of allParts ?? []) {
    const row = raw as {
      conversation_id: string
      user_id: string
      profiles: unknown
    }
    const part: PartRow = {
      conversation_id: row.conversation_id,
      user_id: row.user_id,
      profiles: singleProfile(row.profiles),
    }
    const list = byConv.get(part.conversation_id) ?? []
    list.push(part)
    byConv.set(part.conversation_id, list)
  }

  let coordinator: HubMessagePreview | null = null
  const teachers: HubMessagePreview[] = []

  for (const c of convList) {
    const cid = c.id as string
    const last = lastByConv.get(cid)
    if (!last) continue
    const typ = c.conversation_type as string
    const subj = (c.subject as string)?.trim()

    if (typ === 'student_coordinator') {
      const row: HubMessagePreview = {
        conversationId: cid,
        body: last.body,
        createdAt: last.created_at,
        headline: subj || 'محادثة مع المنسق',
      }
      if (!coordinator || new Date(row.createdAt) > new Date(coordinator.createdAt)) {
        coordinator = row
      }
      continue
    }

    if (typ === 'teacher_student') {
      const partsInConv = byConv.get(cid) ?? []
      const teacherPart = partsInConv.find(
        (p) => p.user_id !== userId && p.profiles?.role === 'teacher',
      )
      const name = teacherPart?.profiles?.full_name?.trim() || 'الأستاذ'
      teachers.push({
        conversationId: cid,
        body: last.body,
        createdAt: last.created_at,
        headline: name,
      })
    }
  }

  teachers.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  return { coordinator, teachers, error: null }
}

type PostRow = {
  id: string
  title: string | null
  content: string
  created_at: string
  author_id: string
  post_type: string
  pinned: boolean
  group_id: string | null
  scope: 'group' | 'workspace'
  profiles: { full_name: string | null; role: string } | null
}

/** منشورات مثبتة + إعلانات المنسقين + آخر منشور لكل أستاذ (حسب author_id) */
export async function fetchStudentHubPosts(
  supabase: SupabaseClient,
  workspaceId: string,
  groupId: string,
): Promise<{
  pinned: HubPostPinned[]
  coordinatorAnnouncements: HubCoordinatorAnnouncement[]
  perTeacher: HubPostPerTeacher[]
  latestTeacherAnnouncement: HubTeacherPostBlurb | null
  latestTeacherGeneral: HubTeacherPostBlurb | null
  error: string | null
}> {
  const [{ data, error }, coordRes] = await Promise.all([
    supabase
      .from('posts')
      .select(
        'id, title, content, created_at, author_id, post_type, pinned, group_id, scope, profiles(full_name, role)',
      )
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null)
      .or(`group_id.eq.${groupId},scope.eq.workspace`)
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(120),
    supabase
      .from('group_members')
      .select('user_id')
      .eq('group_id', groupId)
      .eq('role_in_group', 'coordinator')
      .eq('status', 'active'),
  ])

  if (error) {
    return {
      pinned: [],
      coordinatorAnnouncements: [],
      perTeacher: [],
      latestTeacherAnnouncement: null,
      latestTeacherGeneral: null,
      error: error.message,
    }
  }

  const coordinatorAuthorIds = new Set(
    coordRes.error
      ? []
      : (coordRes.data ?? []).map((r) => r.user_id as string).filter(Boolean),
  )

  const rows: PostRow[] = (data ?? []).map((raw) => {
    const r = raw as {
      id: string
      title: string | null
      content: string
      created_at: string
      author_id: string
      pinned: boolean
      group_id: string | null
      scope: 'group' | 'workspace'
      profiles: unknown
    }
    return {
      id: r.id,
      title: r.title,
      content: r.content,
      created_at: r.created_at,
      author_id: r.author_id,
      post_type: (r as { post_type?: string }).post_type ?? 'general',
      pinned: r.pinned,
      group_id: r.group_id,
      scope: r.scope,
      profiles: singleProfile(r.profiles),
    }
  })
  const pinned: HubPostPinned[] = []
  for (const row of rows) {
    if (!row.pinned) break
    if (pinned.length >= 5) break
    pinned.push({
      id: row.id,
      title: row.title,
      content: row.content,
      createdAt: row.created_at,
      authorName: row.profiles?.full_name?.trim() ?? null,
      scope: row.scope,
    })
  }

  const coordinatorAnnouncements: HubCoordinatorAnnouncement[] = []
  if (coordinatorAuthorIds.size > 0) {
    const coordRows = rows
      .filter((row) => coordinatorAuthorIds.has(row.author_id))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    for (const row of coordRows.slice(0, 12)) {
      coordinatorAnnouncements.push({
        id: row.id,
        title: row.title,
        content: row.content,
        createdAt: row.created_at,
        authorName: row.profiles?.full_name?.trim() ?? null,
      })
    }
  }

  const perTeacher: HubPostPerTeacher[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    const prof = row.profiles
    if (prof?.role !== 'teacher') continue
    const aid = row.author_id
    if (seen.has(aid)) continue
    seen.add(aid)
    const text = row.content ?? ''
    perTeacher.push({
      authorId: aid,
      authorName: prof.full_name?.trim() || 'أستاذ',
      postId: row.id,
      title: row.title,
      contentPreview: text.length > 140 ? `${text.slice(0, 140)}…` : text,
      createdAt: row.created_at,
      scope: row.scope,
    })
  }

  const teacherRows = rows
    .filter((row) => row.profiles?.role === 'teacher')
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  let latestTeacherAnnouncement: HubTeacherPostBlurb | null = null
  let latestTeacherGeneral: HubTeacherPostBlurb | null = null
  for (const row of teacherRows) {
    const prof = row.profiles
    if (!prof) continue
    const text = row.content ?? ''
    const preview = text.length > 140 ? `${text.slice(0, 140)}…` : text
    const blurb: HubTeacherPostBlurb = {
      postId: row.id,
      authorId: row.author_id,
      authorName: prof.full_name?.trim() || 'أستاذ',
      title: row.title,
      contentPreview: preview,
      createdAt: row.created_at,
      scope: row.scope,
      postType: row.post_type,
    }
    if (!latestTeacherAnnouncement && row.post_type === 'announcement') {
      latestTeacherAnnouncement = blurb
    }
    if (!latestTeacherGeneral && row.post_type !== 'announcement') {
      latestTeacherGeneral = blurb
    }
    if (latestTeacherAnnouncement && latestTeacherGeneral) break
  }

  return {
    pinned,
    coordinatorAnnouncements,
    perTeacher,
    latestTeacherAnnouncement,
    latestTeacherGeneral,
    error: null,
  }
}
