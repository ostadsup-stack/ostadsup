import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { fetchWorkspaceForTeacher } from '../../lib/workspace'
import { cohortListLinkAccentStyle, normalizeGroupAccent } from '../../lib/groupTheme'
import type { Conversation } from '../../types'
import { Loading } from '../../components/Loading'
import { ErrorBanner } from '../../components/ErrorBanner'
import { EmptyState } from '../../components/EmptyState'

export function TeacherInbox() {
  const { session } = useAuth()
  const [err, setErr] = useState<string | null>(null)
  const [rows, setRows] = useState<Conversation[]>([])
  const [accentByGroupId, setAccentByGroupId] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let ok = true
    ;(async () => {
      if (!session?.user?.id) {
        setAccentByGroupId({})
        setLoading(false)
        return
      }
      const { workspace, error: wsFetchErr } = await fetchWorkspaceForTeacher(session.user.id)
      if (!ok) return
      if (wsFetchErr || !workspace) {
        setErr(wsFetchErr?.message ?? 'لا مساحة')
        setRows([])
        setAccentByGroupId({})
        setLoading(false)
        return
      }
      const { data: wsConvs, error: convListErr } = await supabase
        .from('conversations')
        .select('*')
        .eq('workspace_id', workspace.id)
        .order('created_at', { ascending: false })
      if (!ok) return
      if (convListErr) {
        setErr(convListErr.message)
        setRows([])
        setAccentByGroupId({})
        setLoading(false)
        return
      }
      const { data: staffLinks } = await supabase
        .from('group_staff')
        .select('group_id')
        .eq('teacher_id', session.user.id)
        .eq('status', 'active')
      const gids = [...new Set((staffLinks ?? []).map((r) => r.group_id as string))]
      let staffConvs: Conversation[] = []
      if (gids.length > 0) {
        const { data: sc } = await supabase
          .from('conversations')
          .select('*')
          .eq('conversation_type', 'teacher_staff')
          .in('group_id', gids)
          .order('created_at', { ascending: false })
        staffConvs = (sc as Conversation[]) ?? []
      }
      const seen = new Set<string>()
      const merged: Conversation[] = []
      for (const c of [...((wsConvs as Conversation[]) ?? []), ...staffConvs]) {
        if (seen.has(c.id)) continue
        seen.add(c.id)
        merged.push(c)
      }
      merged.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      const convGroupIds = [...new Set(merged.map((c) => c.group_id).filter(Boolean))]
      const acc: Record<string, string> = {}
      if (convGroupIds.length > 0) {
        const { data: gs } = await supabase
          .from('groups')
          .select('id, accent_color')
          .in('id', convGroupIds)
        for (const row of gs ?? []) {
          const r = row as { id: string; accent_color: string | null }
          acc[r.id] = normalizeGroupAccent(r.accent_color)
        }
      }
      setAccentByGroupId(acc)
      setErr(null)
      setRows(merged)
      setLoading(false)
    })()
    return () => {
      ok = false
    }
  }, [session?.user?.id])

  if (loading) return <Loading />

  return (
    <div className="page">
      <h1>صندوق المحادثات</h1>
      <ErrorBanner message={err} />
      {rows.length === 0 ? (
        <EmptyState title="لا محادثات بعد" hint="عندما يرسل الطلبة رسائل ستظهر هنا." />
      ) : (
        <ul className="list-links">
          {rows.map((c) => (
            <li key={c.id}>
              <Link
                to={`/t/inbox/${c.id}`}
                className={c.group_id && accentByGroupId[c.group_id] ? 'list-links__link--cohort' : undefined}
                style={
                  c.group_id && accentByGroupId[c.group_id]
                    ? cohortListLinkAccentStyle(accentByGroupId[c.group_id])
                    : undefined
                }
              >
                {c.subject ?? 'بدون عنوان'}
                <span className="badge">
                  {c.conversation_type === 'teacher_staff'
                    ? 'طاقم'
                    : c.conversation_type === 'teacher_coordinator'
                      ? 'منسق'
                      : 'طالب'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
