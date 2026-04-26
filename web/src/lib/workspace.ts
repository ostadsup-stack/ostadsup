import { supabase } from './supabase'

/** مساحة يملكها الأستاذ (إن وُجدت)، دون الاعتماد على group_staff. */
export async function fetchOwnedWorkspaceForTeacher(teacherId: string) {
  const { data, error } = await supabase
    .from('workspaces')
    .select('*')
    .eq('owner_teacher_id', teacherId)
    .maybeSingle()
  return { workspace: data, error }
}

/**
 * مساحة العمل للواجهة والمسارات: ملك الأستاذ، أو مساحة المضيف عند الأستاذ المرتبط بفوج فقط.
 */
export async function fetchWorkspaceForTeacher(teacherId: string) {
  const { workspace: owned, error: ownedErr } = await fetchOwnedWorkspaceForTeacher(teacherId)
  if (ownedErr) return { workspace: null, error: ownedErr }
  if (owned) return { workspace: owned, error: null }

  const { data: gs, error: gsErr } = await supabase
    .from('group_staff')
    .select('group_id')
    .eq('teacher_id', teacherId)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()
  if (gsErr) return { workspace: null, error: gsErr }
  const gid = gs?.group_id as string | undefined

  if (gid) {
    const { data: g, error: gErr } = await supabase
      .from('groups')
      .select('workspace_id')
      .eq('id', gid)
      .maybeSingle()
    if (gErr || !g?.workspace_id) return { workspace: null, error: gErr ?? null }

    const { data: ws, error: wsErr } = await supabase
      .from('workspaces')
      .select('*')
      .eq('id', g.workspace_id as string)
      .maybeSingle()
    if (wsErr) return { workspace: null, error: wsErr }
    if (ws) return { workspace: ws, error: null }
  }

  const { data: ensuredId, error: rpcErr } = await supabase.rpc('ensure_personal_teacher_workspace')
  if (rpcErr) return { workspace: null, error: rpcErr }
  const eid = typeof ensuredId === 'string' ? ensuredId : null
  if (!eid) return { workspace: null, error: null }

  const { data: createdWs, error: loadErr } = await supabase
    .from('workspaces')
    .select('*')
    .eq('id', eid)
    .maybeSingle()
  return { workspace: createdWs, error: loadErr }
}

export function shareWhatsAppMessage(text: string) {
  const u = `https://wa.me/?text=${encodeURIComponent(text)}`
  window.open(u, '_blank', 'noopener,noreferrer')
}
