import { supabase } from './supabase'

/** صف في صفحة إدارة الأساتذة — ملفات role=teacher + ربط اختياري بجدول teachers. */
export type AdminCatalogTeacherRow = {
  /** معرّف سجل teachers للتحديث؛ null إن لم يُنشأ سجل كتالوج بعد */
  catalog_id: string | null
  profile_id: string | null
  full_name: string
  specialty_display: string | null
  email: string
  app_contact: string | null
  whatsapp: string | null
  is_active: boolean
  catalog_hidden: boolean
  cohort_count: number
  college_name: string | null
  /** حالة ملف المنصة (active/blocked) عند وجود profile */
  profile_status: string | null
  has_catalog_row: boolean
}

function syntheticCatalogEmail(profileId: string, publicContactEmail: string | null): string {
  const v = publicContactEmail?.trim()
  if (v && v.includes('@')) return v
  return `${profileId.replace(/-/g, '')}@catalog.ostadi`
}

async function countGroupsByOwnerProfile(profileIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  for (const id of profileIds) counts.set(id, 0)
  if (profileIds.length === 0) return counts

  const { data: groups, error: gErr } = await supabase.from('groups').select('workspace_id')
  if (gErr) throw new Error(gErr.message)

  const wsIds = [
    ...new Set(
      ((groups ?? []) as { workspace_id: string }[]).map((g) => g.workspace_id).filter(Boolean),
    ),
  ]
  if (wsIds.length === 0) return counts

  const { data: wsRows, error: wErr } = await supabase
    .from('workspaces')
    .select('id, owner_teacher_id')
    .in('id', wsIds)
  if (wErr) throw new Error(wErr.message)

  const ownerByWs = new Map<string, string>()
  for (const w of (wsRows ?? []) as { id: string; owner_teacher_id: string }[]) {
    ownerByWs.set(w.id, w.owner_teacher_id)
  }

  const allowed = new Set(profileIds)
  for (const g of (groups ?? []) as { workspace_id: string }[]) {
    const owner = ownerByWs.get(g.workspace_id)
    if (!owner || !allowed.has(owner)) continue
    counts.set(owner, (counts.get(owner) ?? 0) + 1)
  }
  return counts
}

/** إنشاء صف في teachers مربوط بملف أستاذ (بريد اصطناعي إن لزم). */
export async function insertTeacherCatalogForProfile(params: {
  profile_id: string
  full_name: string
  specialty: string | null
  public_contact_email: string | null
  is_active?: boolean
  catalog_hidden?: boolean
}): Promise<{ catalog_id: string | null; error: string | null }> {
  const email = syntheticCatalogEmail(params.profile_id, params.public_contact_email)
  const { data, error } = await supabase
    .from('teachers')
    .insert({
      full_name: params.full_name.trim() || '—',
      email,
      profile_id: params.profile_id,
      specialty: params.specialty?.trim() || null,
      is_active: params.is_active ?? true,
      catalog_hidden: params.catalog_hidden ?? false,
    })
    .select('id')
    .maybeSingle()

  if (error) return { catalog_id: null, error: error.message }
  const id = data && typeof data === 'object' && 'id' in data ? (data as { id: string }).id : null
  return { catalog_id: id, error: null }
}

export async function loadAdminTeachersCatalog(): Promise<{
  rows: AdminCatalogTeacherRow[]
  error: string | null
}> {
  try {
    const { data: profiles, error: pErr } = await supabase
      .from('profiles')
      .select('id, full_name, specialty, phone, whatsapp, status, public_contact_email')
      .eq('role', 'teacher')
      .order('full_name')

    if (pErr) return { rows: [], error: pErr.message }

    const profileList = (profiles ?? []) as {
      id: string
      full_name: string
      specialty: string | null
      phone: string | null
      whatsapp: string | null
      status: string
      public_contact_email: string | null
    }[]

    const { data: teachers, error: tErr } = await supabase
      .from('teachers')
      .select('id, full_name, email, is_active, specialty, profile_id, college_id, catalog_hidden')
      .order('full_name')

    if (tErr) return { rows: [], error: tErr.message }

    const teacherRows = (teachers ?? []) as {
      id: string
      full_name: string
      email: string
      is_active: boolean
      specialty: string | null
      profile_id: string | null
      college_id: string | null
      catalog_hidden: boolean
    }[]

    const teacherByProfileId = new Map<string, (typeof teacherRows)[0]>()
    for (const t of teacherRows) {
      if (t.profile_id) teacherByProfileId.set(t.profile_id, t)
    }

    const profileIds = profileList.map((p) => p.id)
    const collegeIds = [
      ...new Set(
        teacherRows.map((t) => t.college_id).filter(Boolean),
      ),
    ] as string[]

    let collegeRows: { id: string; name: string }[] = []
    if (collegeIds.length > 0) {
      const { data, error } = await supabase.from('colleges').select('id, name').in('id', collegeIds)
      if (error) return { rows: [], error: error.message }
      collegeRows = (data ?? []) as typeof collegeRows
    }
    const collegeById = new Map(collegeRows.map((c) => [c.id, c.name?.trim() || '']))

    const countsMap = await countGroupsByOwnerProfile(profileIds)

    const consumedCatalogIds = new Set<string>()
    const rows: AdminCatalogTeacherRow[] = []

    for (const p of profileList) {
      const t = teacherByProfileId.get(p.id)
      if (t) consumedCatalogIds.add(t.id)

      const specT = t?.specialty?.trim()
      const specP = p.specialty?.trim()
      const specialty_display = specT || specP || null

      const catalogEmail = t?.email?.trim()
      const pub = p.public_contact_email?.trim()
      const email = catalogEmail || (pub && pub.includes('@') ? pub : '—')

      if (t) {
        rows.push({
          catalog_id: t.id,
          profile_id: p.id,
          full_name: p.full_name?.trim() || t.full_name?.trim() || '—',
          specialty_display,
          email,
          app_contact: p.phone?.trim() || null,
          whatsapp: p.whatsapp?.trim() || null,
          is_active: t.is_active,
          catalog_hidden: Boolean(t.catalog_hidden),
          cohort_count: countsMap.get(p.id) ?? 0,
          college_name: t.college_id ? collegeById.get(t.college_id) || null : null,
          profile_status: p.status,
          has_catalog_row: true,
        })
      } else {
        rows.push({
          catalog_id: null,
          profile_id: p.id,
          full_name: p.full_name?.trim() || '—',
          specialty_display,
          email: pub && pub.includes('@') ? pub : '—',
          app_contact: p.phone?.trim() || null,
          whatsapp: p.whatsapp?.trim() || null,
          is_active: true,
          catalog_hidden: false,
          cohort_count: countsMap.get(p.id) ?? 0,
          college_name: null,
          profile_status: p.status,
          has_catalog_row: false,
        })
      }
    }

    for (const t of teacherRows) {
      if (consumedCatalogIds.has(t.id)) continue
      const specT = t.specialty?.trim()
      rows.push({
        catalog_id: t.id,
        profile_id: t.profile_id,
        full_name: t.full_name?.trim() || '—',
        specialty_display: specT || null,
        email: t.email?.trim() || '—',
        app_contact: null,
        whatsapp: null,
        is_active: t.is_active,
        catalog_hidden: Boolean(t.catalog_hidden),
        cohort_count: t.profile_id ? (countsMap.get(t.profile_id) ?? 0) : 0,
        college_name: t.college_id ? collegeById.get(t.college_id) || null : null,
        profile_status: null,
        has_catalog_row: true,
      })
    }

    return { rows, error: null }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { rows: [], error: msg }
  }
}
