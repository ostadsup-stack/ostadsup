import { supabase } from './supabase'
import type { CollegeDashboardCard } from './adminCollegesDashboard'

export type UniversityDashboardCard = {
  id: string
  name: string
  description: string | null
  collegeCount: number
  teacherCount: number
  groupCount: number
  studentCount: number
}

/** تجميع إحصاءات لمجموعة من معرفات الكليات */
async function aggregateStatsForCollegeIds(
  collegeIds: string[],
): Promise<{ error: string | null; teacherCount: number; groupCount: number; studentCount: number }> {
  const idSet = new Set(collegeIds)
  if (idSet.size === 0) {
    return { error: null, teacherCount: 0, groupCount: 0, studentCount: 0 }
  }

  const { data: teachers, error: tErr } = await supabase.from('teachers').select('college_id')
  if (tErr) return { error: tErr.message, teacherCount: 0, groupCount: 0, studentCount: 0 }

  let teacherCount = 0
  for (const row of (teachers ?? []) as { college_id: string | null }[]) {
    if (row.college_id && idSet.has(row.college_id)) teacherCount += 1
  }

  const { data: groups, error: gErr } = await supabase.from('groups').select('id, college_id, status')
  if (gErr) return { error: gErr.message, teacherCount: 0, groupCount: 0, studentCount: 0 }

  const groupRows = (groups ?? []) as { id: string; college_id: string | null; status: string }[]
  let groupCount = 0
  const activeInSet: { id: string; college_id: string | null }[] = []
  for (const g of groupRows) {
    if (!g.college_id || !idSet.has(g.college_id)) continue
    if (g.status === 'active') {
      groupCount += 1
      activeInSet.push(g)
    }
  }

  const allActiveIds = activeInSet.map((g) => g.id)
  const groupToCollege = new Map<string, string>()
  for (const g of activeInSet) {
    if (g.college_id) groupToCollege.set(g.id, g.college_id)
  }

  const users = new Set<string>()
  if (allActiveIds.length > 0) {
    const chunk = 200
    for (let i = 0; i < allActiveIds.length; i += chunk) {
      const slice = allActiveIds.slice(i, i + chunk)
      const { data: batch, error: mErr } = await supabase
        .from('group_members')
        .select('group_id, user_id, role_in_group, status')
        .in('group_id', slice)
      if (mErr) return { error: mErr.message, teacherCount: 0, groupCount: 0, studentCount: 0 }
      for (const m of (batch ?? []) as {
        group_id: string
        user_id: string
        role_in_group: string
        status: string
      }[]) {
        if (m.role_in_group !== 'student' || m.status !== 'active') continue
        const cid = groupToCollege.get(m.group_id)
        if (cid && idSet.has(cid)) users.add(m.user_id)
      }
    }
  }

  return { error: null, teacherCount, groupCount, studentCount: users.size }
}

export async function loadAdminUniversitiesDashboard(): Promise<{
  cards: UniversityDashboardCard[]
  error: string | null
}> {
  const { data: unis, error: uErr } = await supabase
    .from('universities')
    .select('id, name, description')
    .order('name')

  if (uErr) return { cards: [], error: uErr.message }

  const uniList = (unis ?? []) as { id: string; name: string; description: string | null }[]
  if (uniList.length === 0) return { cards: [], error: null }

  const { data: colleges, error: cErr } = await supabase
    .from('colleges')
    .select('id, university_id')
    .order('name')

  if (cErr) return { cards: [], error: cErr.message }

  const collegeRows = (colleges ?? []) as { id: string; university_id: string }[]
  const collegeIdsByUni = new Map<string, string[]>()
  for (const c of collegeRows) {
    if (!c.university_id) continue
    const list = collegeIdsByUni.get(c.university_id) ?? []
    list.push(c.id)
    collegeIdsByUni.set(c.university_id, list)
  }

  const cards: UniversityDashboardCard[] = []
  for (const u of uniList) {
    const cids = collegeIdsByUni.get(u.id) ?? []
    const agg = await aggregateStatsForCollegeIds(cids)
    if (agg.error) return { cards: [], error: agg.error }
    cards.push({
      id: u.id,
      name: u.name?.trim() || '—',
      description: u.description?.trim() ? u.description.trim() : null,
      collegeCount: cids.length,
      teacherCount: agg.teacherCount,
      groupCount: agg.groupCount,
      studentCount: agg.studentCount,
    })
  }

  return { cards, error: null }
}

export async function insertUniversity(input: {
  name: string
  description: string | null
}): Promise<{ id: string | null; error: string | null }> {
  const name = input.name.trim()
  if (!name) return { id: null, error: 'اسم الجامعة مطلوب.' }
  const { data, error } = await supabase
    .from('universities')
    .insert({
      name,
      description: input.description?.trim() || null,
    })
    .select('id')
    .single()

  if (error) return { id: null, error: error.message }
  const row = data as { id: string } | null
  return { id: row?.id ?? null, error: null }
}

export async function insertCollege(input: {
  universityId: string
  name: string
  description: string | null
}): Promise<{ id: string | null; error: string | null }> {
  const name = input.name.trim()
  if (!name) return { id: null, error: 'اسم الكلية مطلوب.' }
  const { data, error } = await supabase
    .from('colleges')
    .insert({
      university_id: input.universityId,
      name,
      description: input.description?.trim() || null,
    })
    .select('id')
    .single()

  if (error) return { id: null, error: error.message }
  const row = data as { id: string } | null
  return { id: row?.id ?? null, error: null }
}

export type CollegeSummaryForUniversity = CollegeDashboardCard & {
  description: string | null
}

export async function loadCollegesForUniversity(
  universityId: string,
): Promise<{ rows: CollegeSummaryForUniversity[]; error: string | null }> {
  const { data: colleges, error: cErr } = await supabase
    .from('colleges')
    .select('id, name, description')
    .eq('university_id', universityId)
    .order('name')

  if (cErr) return { rows: [], error: cErr.message }

  const list = (colleges ?? []) as { id: string; name: string; description: string | null }[]
  if (list.length === 0) return { rows: [], error: null }

  const { data: teachers, error: tErr } = await supabase.from('teachers').select('college_id')
  if (tErr) return { rows: [], error: tErr.message }

  const { data: groups, error: gErr } = await supabase.from('groups').select('id, college_id, status')
  if (gErr) return { rows: [], error: gErr.message }

  const groupRows = (groups ?? []) as { id: string; college_id: string | null; status: string }[]

  const teacherByCollege = new Map<string, number>()
  for (const row of (teachers ?? []) as { college_id: string | null }[]) {
    if (!row.college_id) continue
    teacherByCollege.set(row.college_id, (teacherByCollege.get(row.college_id) ?? 0) + 1)
  }

  const groupByCollege = new Map<string, number>()
  for (const g of groupRows) {
    if (!g.college_id || g.status !== 'active') continue
    groupByCollege.set(g.college_id, (groupByCollege.get(g.college_id) ?? 0) + 1)
  }

  const allActiveGroupIds = [...new Set(groupRows.filter((g) => g.status === 'active').map((g) => g.id))]
  let members: { group_id: string; user_id: string; role_in_group: string; status: string }[] = []

  if (allActiveGroupIds.length > 0) {
    const chunk = 200
    for (let i = 0; i < allActiveGroupIds.length; i += chunk) {
      const slice = allActiveGroupIds.slice(i, i + chunk)
      const { data: batch, error: mErr } = await supabase
        .from('group_members')
        .select('group_id, user_id, role_in_group, status')
        .in('group_id', slice)
      if (mErr) return { rows: [], error: mErr.message }
      members = members.concat((batch ?? []) as typeof members)
    }
  }

  const groupToCollege = new Map<string, string>()
  for (const g of groupRows) {
    if (g.status === 'active' && g.college_id) groupToCollege.set(g.id, g.college_id)
  }

  const studentsByCollege = new Map<string, Set<string>>()
  for (const m of members) {
    if (m.role_in_group !== 'student' || m.status !== 'active') continue
    const cid = groupToCollege.get(m.group_id)
    if (!cid) continue
    if (!studentsByCollege.has(cid)) studentsByCollege.set(cid, new Set())
    studentsByCollege.get(cid)!.add(m.user_id)
  }

  const rows: CollegeSummaryForUniversity[] = list.map((c) => ({
    id: c.id,
    name: c.name?.trim() || '—',
    description: c.description?.trim() ? c.description.trim() : null,
    teacherCount: teacherByCollege.get(c.id) ?? 0,
    groupCount: groupByCollege.get(c.id) ?? 0,
    studentCount: studentsByCollege.get(c.id)?.size ?? 0,
  }))

  return { rows, error: null }
}

export async function loadUniversityById(
  universityId: string,
): Promise<{
  row: { id: string; name: string; description: string | null } | null
  error: string | null
}> {
  const { data, error } = await supabase
    .from('universities')
    .select('id, name, description')
    .eq('id', universityId)
    .maybeSingle()

  if (error) return { row: null, error: error.message }
  if (!data) return { row: null, error: null }
  const r = data as { id: string; name: string; description: string | null }
  return {
    row: {
      id: r.id,
      name: r.name?.trim() || '—',
      description: r.description?.trim() ? r.description.trim() : null,
    },
    error: null,
  }
}
