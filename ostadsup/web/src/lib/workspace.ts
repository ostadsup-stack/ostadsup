import { supabase } from './supabase'

export async function fetchWorkspaceForTeacher(teacherId: string) {
  const { data, error } = await supabase
    .from('workspaces')
    .select('*')
    .eq('owner_teacher_id', teacherId)
    .maybeSingle()
  return { workspace: data, error }
}

export function shareWhatsAppMessage(text: string) {
  const u = `https://wa.me/?text=${encodeURIComponent(text)}`
  window.open(u, '_blank', 'noopener,noreferrer')
}
