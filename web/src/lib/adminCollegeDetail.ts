import { supabase } from './supabase'

export type CollegeTeacherRow = {
  id: string
  full_name: string
  specialty: string | null
  /** أفواج المنصة (groups) لهذه الكلية تحت مساحة الأستاذ المرتبط */
  cohort_count: number
}

export type CollegeGroupRow = {
  id: string
  group_name: string
  join_code: string
  study_level: string
  status: string
  workspace_id: string
  owner_name: string
  student_count: number
  cohort_suffix: string | null
  schedule_mode: string
  study_track: string
}

export type CollegeStudentRow = {
  user_id: string
  full_name: string
  group_count: number
  status: string
}

export type TeacherPickOption = { profile_id: string; label: string }

export async function loadCollegeTeachersSection(
  collegeId: string,
): Promise<{ rows: CollegeTeacherRow[]; error: string | null }> {
  const { data: teachers, error: tErr } = await supabase
    .from('teachers')
    .select('id, full_name, specialty, profile_id')
    .eq('college_id', collegeId)
    .order('full_name')

  if (tErr) return { rows: [], error: tErr.message }

  const list = (teachers ?? []) as {
    id: string
    full_name: string
    specialty: string | null
    profile_id: string | null
  }[]

  const { data: groupRows, error: gErr } = await supabase
    .from('groups')
    .select('id, workspace_id')
    .eq('college_id', collegeId)

  if (gErr) return { rows: [], error: gErr.message }

  const groups = (groupRows ?? []) as { id: string; workspace_id: string }[]
  const wsIds = [...new Set(groups.map((g) => g.workspace_id).filter(Boolean))]
  const wsById = new Map<string, { owner_teacher_id: string }>()

  if (wsIds.length > 0) {
    const { data: ws, error: wErr } = await supabase
      .from('workspaces')
      .select('id, owner_teacher_id')
      .in('id', wsIds)
    if (wErr) return { rows: [], error: wErr.message }
    for (const w of (ws ?? []) as { id: string; owner_teacher_id: string }[]) {
      wsById.set(w.id, w)
    }
  }

  const countForProfile = (profileId: string | null) => {
    if (!profileId) return 0
    return groups.filter((g) => wsById.get(g.workspace_id)?.owner_teacher_id === profileId).length
  }

  const rows: CollegeTeacherRow[] = list.map((t) => ({
    id: t.id,
    full_name: t.full_name?.trim() || '—',
    specialty: t.specialty?.trim() ? t.specialty.trim() : null,
    cohort_count: countForProfile(t.profile_id),
  }))

  return { rows, error: null }
}

function buildGroupRowsForCollege(
  gList: {
    id: string
    group_name: string
    join_code: string
    study_level: string
    status: string
    workspace_id: string
    cohort_suffix: string | null
    schedule_mode: string
    study_track: string
  }[],
  workspaces: { id: string; owner_teacher_id: string }[],
  profiles: { id: string; full_name: string }[],
  members: { group_id: string; role_in_group: string; status: string }[],
): CollegeGroupRow[] {
  const wsById = new Map(workspaces.map((w) => [w.id, w]))
  const profById = new Map(profiles.map((p) => [p.id, p.full_name?.trim() || '']))
  const studentCountByGroup = new Map<string, number>()
  for (const m of members) {
    if (m.role_in_group === 'student' && m.status === 'active') {
      studentCountByGroup.set(m.group_id, (studentCountByGroup.get(m.group_id) ?? 0) + 1)
    }
  }

  return gList.map((g) => {
    const ws = wsById.get(g.workspace_id)
    const ownerId = ws?.owner_teacher_id
    const ownerName = ownerId ? profById.get(ownerId) || '—' : '—'
    return {
      id: g.id,
      group_name: g.group_name,
      join_code: g.join_code,
      study_level: g.study_level,
      status: g.status,
      workspace_id: g.workspace_id,
      owner_name: ownerName,
      student_count: studentCountByGroup.get(g.id) ?? 0,
      cohort_suffix: g.cohort_suffix,
      schedule_mode: g.schedule_mode ?? 'normal',
      study_track: g.study_track ?? 'normal',
    }
  })
}

export async function loadCollegeGroupsSection(
  collegeId: string,
): Promise<{ rows: CollegeGroupRow[]; error: string | null }> {
  const { data: groups, error: gErr } = await supabase
    .from('groups')
    .select('id, group_name, join_code, study_level, status, workspace_id, cohort_suffix, schedule_mode, study_track')
    .eq('college_id', collegeId)
    .order('group_name')

  if (gErr) return { rows: [], error: gErr.message }

  const gList = (groups ?? []) as {
    id: string
    group_name: string
    join_code: string
    study_level: string
    status: string
    workspace_id: string
    cohort_suffix: string | null
    schedule_mode: string
    study_track: string
  }[]
  if (gList.length === 0) return { rows: [], error: null }

  const wsIds = [...new Set(gList.map((g) => g.workspace_id).filter(Boolean))]
  const { data: workspaces, error: wErr } = await supabase
    .from('workspaces')
    .select('id, owner_teacher_id')
    .in('id', wsIds)
  if (wErr) return { rows: [], error: wErr.message }

  const wsRows = (workspaces ?? []) as { id: string; owner_teacher_id: string }[]
  const ownerIds = [...new Set(wsRows.map((w) => w.owner_teacher_id).filter(Boolean))]
  const { data: profiles, error: pErr } =
    ownerIds.length > 0
      ? await supabase.from('profiles').select('id, full_name').in('id', ownerIds)
      : { data: [] as { id: string; full_name: string }[], error: null }
  if (pErr) return { rows: [], error: pErr.message }

  const groupIds = gList.map((g) => g.id)
  const { data: members, error: mErr } = await supabase
    .from('group_members')
    .select('group_id, role_in_group, status')
    .in('group_id', groupIds)
  if (mErr) return { rows: [], error: mErr.message }

  const rows = buildGroupRowsForCollege(gList, wsRows, (profiles ?? []) as { id: string; full_name: string }[], (members ?? []) as { group_id: string; role_in_group: string; status: string }[])

  return { rows, error: null }
}

export async function loadCollegeStudentsSection(
  collegeId: string,
): Promise<{ rows: CollegeStudentRow[]; error: string | null }> {
  const { data: groups, error: gErr } = await supabase.from('groups').select('id').eq('college_id', collegeId)
  if (gErr) return { rows: [], error: gErr.message }

  const groupIds = ((groups ?? []) as { id: string }[]).map((g) => g.id)
  if (groupIds.length === 0) return { rows: [], error: null }

  const groupIdSet = new Set(groupIds)
  const members: { group_id: string; user_id: string; role_in_group: string; status: string }[] = []
  const chunk = 200
  for (let i = 0; i < groupIds.length; i += chunk) {
    const slice = groupIds.slice(i, i + chunk)
    const { data: batch, error: mErr } = await supabase
      .from('group_members')
      .select('group_id, user_id, role_in_group, status')
      .in('group_id', slice)
    if (mErr) return { rows: [], error: mErr.message }
    members.push(...((batch ?? []) as typeof members))
  }

  const byUser = new Map<string, Set<string>>()
  for (const m of members) {
    if (m.role_in_group !== 'student' || m.status !== 'active') continue
    if (!groupIdSet.has(m.group_id)) continue
    if (!byUser.has(m.user_id)) byUser.set(m.user_id, new Set())
    byUser.get(m.user_id)!.add(m.group_id)
  }

  const userIds = [...byUser.keys()]
  if (userIds.length === 0) return { rows: [], error: null }

  const { data: profiles, error: pErr } = await supabase
    .from('profiles')
    .select('id, full_name, status')
    .in('id', userIds)
    .order('full_name')
  if (pErr) return { rows: [], error: pErr.message }

  const rows: CollegeStudentRow[] = ((profiles ?? []) as { id: string; full_name: string; status: string }[]).map(
    (p) => ({
      user_id: p.id,
      full_name: p.full_name?.trim() || '—',
      group_count: byUser.get(p.id)?.size ?? 0,
      status: p.status,
    }),
  )

  return { rows, error: null }
}

export async function loadTeacherOptionsForCollege(
  collegeId: string,
): Promise<{ options: TeacherPickOption[]; error: string | null }> {
  const { data: teachers, error } = await supabase
    .from('teachers')
    .select('full_name, profile_id')
    .eq('college_id', collegeId)
    .not('profile_id', 'is', null)
    .order('full_name')

  if (error) return { options: [], error: error.message }

  const fromCatalog = ((teachers ?? []) as { full_name: string; profile_id: string | null }[])
    .filter((t) => t.profile_id)
    .map((t) => ({
      profile_id: t.profile_id as string,
      label: t.full_name?.trim() || '—',
    }))

  if (fromCatalog.length > 0) return { options: fromCatalog, error: null }

  const { data: profiles, error: pErr } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('role', ['teacher', 'admin'])
    .order('full_name')
    .limit(400)

  if (pErr) return { options: [], error: pErr.message }

  return {
    options: ((profiles ?? []) as { id: string; full_name: string }[]).map((p) => ({
      profile_id: p.id,
      label: `${p.full_name?.trim() || '—'} · من المنصة`,
    })),
    error: null,
  }
}

function randomJoinCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let s = ''
  for (let i = 0; i < 10; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return s
}

export async function ensureWorkspaceForProfile(
  ownerProfileId: string,
): Promise<{ workspaceId: string | null; error: string | null }> {
  const { data: existing, error: e1 } = await supabase
    .from('workspaces')
    .select('id')
    .eq('owner_teacher_id', ownerProfileId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (e1) return { workspaceId: null, error: e1.message }
  if (existing && typeof existing === 'object' && 'id' in existing) {
    const id = (existing as { id: string }).id
    if (id) return { workspaceId: id, error: null }
  }

  const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', ownerProfileId).maybeSingle()

  const display = (profile as { full_name?: string } | null)?.full_name?.trim() || 'مساحة'
  const slugBase = `w-${ownerProfileId.replace(/-/g, '').slice(0, 12)}`

  for (let attempt = 0; attempt < 6; attempt++) {
    const slug = (attempt === 0 ? slugBase : `${slugBase}-${attempt}`).slice(0, 48)
    const { data: ins, error: insErr } = await supabase
      .from('workspaces')
      .insert({ owner_teacher_id: ownerProfileId, display_name: display, slug })
      .select('id')
      .single()

    if (!insErr && ins && typeof ins === 'object' && 'id' in ins) {
      return { workspaceId: (ins as { id: string }).id, error: null }
    }
    if (insErr && insErr.code !== '23505') {
      return { workspaceId: null, error: insErr.message }
    }
  }

  return { workspaceId: null, error: 'تعذر إنشاء مساحة للأستاذ (تعارض معرف المساحة).' }
}

export type CreateCollegeGroupInput = {
  collegeId: string
  groupName: string
  studyLevel: 'licence' | 'master' | 'doctorate'
  ownerProfileId: string
  cohortSuffix?: string | null
  scheduleMode: 'normal' | 'simplified'
  studyTrack: 'normal' | 'excellence'
}

/** بيانات دعوة الفوج للمدير (قراءة مباشرة؛ لا يعتمد على RPC حصراً على طاقم الفوج). */
export type AdminGroupInvitePayload = {
  group_name: string
  join_code: string
  student_join_secret: string | null
  teacher_link_secret: string | null
}

export async function loadGroupInvitePayloadForAdmin(
  groupId: string,
): Promise<{ payload: AdminGroupInvitePayload | null; error: string | null }> {
  const { data: g, error: gErr } = await supabase
    .from('groups')
    .select('group_name, join_code')
    .eq('id', groupId)
    .maybeSingle()

  if (gErr) return { payload: null, error: gErr.message }
  const row = g as { group_name: string; join_code: string } | null
  if (!row?.join_code) return { payload: null, error: 'الفوج غير موجود.' }

  const { data: tok, error: tErr } = await supabase
    .from('group_invite_tokens')
    .select('student_join_secret, teacher_link_secret')
    .eq('group_id', groupId)
    .maybeSingle()

  if (tErr) return { payload: null, error: tErr.message }

  const t = tok as { student_join_secret: string; teacher_link_secret: string } | null
  return {
    payload: {
      group_name: row.group_name?.trim() || '—',
      join_code: row.join_code,
      student_join_secret: t?.student_join_secret ?? null,
      teacher_link_secret: t?.teacher_link_secret ?? null,
    },
    error: null,
  }
}

/** صف لنافذة تعديل الفوج من لوحة «إدارة الأفواج» العامة. */
export type AdminGroupEditRow = {
  id: string
  group_name: string
  join_code: string
  study_level: 'licence' | 'master' | 'doctorate'
  cohort_suffix: string | null
  schedule_mode: 'normal' | 'simplified'
  study_track: 'normal' | 'excellence'
  owner_name: string
}

export async function loadGroupForAdminEdit(
  groupId: string,
): Promise<{ row: AdminGroupEditRow | null; error: string | null }> {
  const { data: g, error: gErr } = await supabase
    .from('groups')
    .select('id, group_name, join_code, study_level, cohort_suffix, schedule_mode, study_track, workspace_id')
    .eq('id', groupId)
    .maybeSingle()

  if (gErr) return { row: null, error: gErr.message }
  if (!g || typeof g !== 'object' || !('id' in g)) {
    return { row: null, error: 'الفوج غير موجود.' }
  }

  const gr = g as {
    id: string
    group_name: string
    join_code: string
    study_level: string
    cohort_suffix: string | null
    schedule_mode: string | null
    study_track: string | null
    workspace_id: string
  }

  const { data: ws, error: wErr } = await supabase
    .from('workspaces')
    .select('owner_teacher_id')
    .eq('id', gr.workspace_id)
    .maybeSingle()
  if (wErr) return { row: null, error: wErr.message }

  const ownerId = (ws as { owner_teacher_id: string } | null)?.owner_teacher_id
  let ownerName = '—'
  if (ownerId) {
    const { data: prof, error: pErr } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', ownerId)
      .maybeSingle()
    if (pErr) return { row: null, error: pErr.message }
    ownerName = (prof as { full_name?: string } | null)?.full_name?.trim() || '—'
  }

  const sl: AdminGroupEditRow['study_level'] =
    gr.study_level === 'master' || gr.study_level === 'doctorate' ? gr.study_level : 'licence'
  const sm: AdminGroupEditRow['schedule_mode'] = gr.schedule_mode === 'simplified' ? 'simplified' : 'normal'
  const st: AdminGroupEditRow['study_track'] = gr.study_track === 'excellence' ? 'excellence' : 'normal'

  return {
    row: {
      id: gr.id,
      group_name: gr.group_name,
      join_code: gr.join_code,
      study_level: sl,
      cohort_suffix: gr.cohort_suffix,
      schedule_mode: sm,
      study_track: st,
      owner_name: ownerName,
    },
    error: null,
  }
}

export async function createCollegeGroup(
  input: CreateCollegeGroupInput,
): Promise<{ id: string | null; join_code: string | null; error: string | null }> {
  const { workspaceId, error: wErr } = await ensureWorkspaceForProfile(input.ownerProfileId)
  if (wErr || !workspaceId) return { id: null, join_code: null, error: wErr ?? 'لا توجد مساحة للأستاذ' }

  let joinCode = randomJoinCode()
  for (let attempt = 0; attempt < 10; attempt++) {
    const { data: row, error } = await supabase
      .from('groups')
      .insert({
        workspace_id: workspaceId,
        group_name: input.groupName.trim(),
        join_code: joinCode,
        study_level: input.studyLevel,
        college_id: input.collegeId,
        status: 'active',
        cohort_suffix: input.cohortSuffix?.trim() || null,
        schedule_mode: input.scheduleMode,
        study_track: input.studyTrack,
      })
      .select('id, join_code')
      .single()

    if (!error && row && typeof row === 'object' && 'id' in row) {
      const r = row as { id: string; join_code: string }
      return { id: r.id, join_code: r.join_code ?? joinCode, error: null }
    }
    if (error?.code === '23505' || error?.message?.toLowerCase().includes('unique')) {
      joinCode = randomJoinCode()
      continue
    }
    return { id: null, join_code: null, error: error?.message ?? 'فشل إنشاء الفوج' }
  }

  return { id: null, join_code: null, error: 'تعذر توليد كود انضمام فريد.' }
}

export async function updateCollegeGroup(
  groupId: string,
  patch: {
    group_name?: string
    study_level?: 'licence' | 'master' | 'doctorate'
    cohort_suffix?: string | null
    schedule_mode?: 'normal' | 'simplified'
    study_track?: 'normal' | 'excellence'
  },
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('groups').update(patch).eq('id', groupId)
  return { error: error?.message ?? null }
}

/** تعطيل = أرشفة (نفس منطق AdminGroupsPage) */
export async function setCollegeGroupArchived(
  groupId: string,
  archived: boolean,
): Promise<{ error: string | null }> {
  const status = archived ? 'archived' : 'active'
  const { error } = await supabase.from('groups').update({ status }).eq('id', groupId)
  return { error: error?.message ?? null }
}

export async function deleteCollegeGroup(groupId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('groups').delete().eq('id', groupId)
  return { error: error?.message ?? null }
}

export function studyLevelLabelAr(level: string): string {
  switch (level) {
    case 'licence':
      return 'إجازة'
    case 'master':
      return 'ماستر'
    case 'doctorate':
      return 'دكتوراه'
    default:
      return level
  }
}
