import { supabase } from './supabase'

export type CollegeDashboardCard = {
  id: string
  name: string
  /** تعريف الكلية */
  description?: string | null
  universityId?: string | null
  universityName?: string | null
  teacherCount: number
  groupCount: number
  /** طلاب نشطون (عضوية active) في أفواج مرتبطة بالكلية — عدد مستخدمين مميزين */
  studentCount: number
}

export async function loadAdminCollegesDashboard(): Promise<{
  cards: CollegeDashboardCard[]
  error: string | null
}> {
  const { data: colleges, error: cErr } = await supabase.from('colleges').select('id, name').order('name')
  if (cErr) return { cards: [], error: cErr.message }

  const collegeList = (colleges ?? []) as { id: string; name: string }[]
  if (collegeList.length === 0) return { cards: [], error: null }

  const { data: teachers, error: tErr } = await supabase.from('teachers').select('college_id')
  if (tErr) return { cards: [], error: tErr.message }

  const { data: groups, error: gErr } = await supabase.from('groups').select('id, college_id, status')
  if (gErr) return { cards: [], error: gErr.message }

  const teacherByCollege = new Map<string, number>()
  for (const row of (teachers ?? []) as { college_id: string | null }[]) {
    if (!row.college_id) continue
    teacherByCollege.set(row.college_id, (teacherByCollege.get(row.college_id) ?? 0) + 1)
  }

  const groupRows = (groups ?? []) as { id: string; college_id: string | null; status: string }[]
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
      if (mErr) return { cards: [], error: mErr.message }
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

  const cards: CollegeDashboardCard[] = collegeList.map((c) => ({
    id: c.id,
    name: c.name,
    teacherCount: teacherByCollege.get(c.id) ?? 0,
    groupCount: groupByCollege.get(c.id) ?? 0,
    studentCount: studentsByCollege.get(c.id)?.size ?? 0,
  }))

  return { cards, error: null }
}

/** تحميل كلية واحدة مع نفس أرقام لوحة التحكم */
export async function loadCollegeDashboardById(
  collegeId: string,
): Promise<{ card: CollegeDashboardCard | null; error: string | null }> {
  const { data: college, error: cErr } = await supabase
    .from('colleges')
    .select('id, name, description, university_id')
    .eq('id', collegeId)
    .maybeSingle()

  if (cErr) return { card: null, error: cErr.message }
  if (!college) return { card: null, error: null }

  const crow = college as {
    id: string
    name: string
    description: string | null
    university_id: string | null
  }
  let universityName: string | null = null
  if (crow.university_id) {
    const { data: u } = await supabase.from('universities').select('name').eq('id', crow.university_id).maybeSingle()
    universityName = (u as { name?: string } | null)?.name?.trim() ?? null
  }

  const { count: teacherCount, error: tErr } = await supabase
    .from('teachers')
    .select('id', { count: 'exact', head: true })
    .eq('college_id', collegeId)

  if (tErr) return { card: null, error: tErr.message }

  const { data: activeGroups, error: gErr } = await supabase
    .from('groups')
    .select('id')
    .eq('college_id', collegeId)
    .eq('status', 'active')

  if (gErr) return { card: null, error: gErr.message }

  const groupIds = ((activeGroups ?? []) as { id: string }[]).map((g) => g.id)
  const groupCount = groupIds.length

  const users = new Set<string>()
  if (groupIds.length > 0) {
    const chunk = 200
    for (let i = 0; i < groupIds.length; i += chunk) {
      const slice = groupIds.slice(i, i + chunk)
      const { data: members, error: mErr } = await supabase
        .from('group_members')
        .select('user_id, role_in_group, status')
        .in('group_id', slice)
      if (mErr) return { card: null, error: mErr.message }
      for (const m of (members ?? []) as {
        user_id: string
        role_in_group: string
        status: string
      }[]) {
        if (m.role_in_group === 'student' && m.status === 'active') users.add(m.user_id)
      }
    }
  }

  const card: CollegeDashboardCard = {
    id: crow.id,
    name: crow.name,
    description: crow.description?.trim() ? crow.description.trim() : null,
    universityId: crow.university_id,
    universityName,
    teacherCount: teacherCount ?? 0,
    groupCount,
    studentCount: users.size,
  }

  return { card, error: null }
}
