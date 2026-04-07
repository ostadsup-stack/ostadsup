import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { fetchWorkspaceForTeacher } from '../../lib/workspace'
import type { Conversation } from '../../types'
import { Loading } from '../../components/Loading'
import { ErrorBanner } from '../../components/ErrorBanner'
import { EmptyState } from '../../components/EmptyState'

export function TeacherInbox() {
  const { session } = useAuth()
  const [err, setErr] = useState<string | null>(null)
  const [rows, setRows] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let ok = true
    ;(async () => {
      if (!session?.user?.id) {
        setLoading(false)
        return
      }
      const { workspace, error: wsFetchErr } = await fetchWorkspaceForTeacher(session.user.id)
      if (!ok) return
      if (wsFetchErr || !workspace) {
        setErr(wsFetchErr?.message ?? 'لا مساحة')
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
              <Link to={`/t/inbox/${c.id}`}>
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
