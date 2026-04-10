import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { cohortListLinkAccentStyle, normalizeGroupAccent } from '../../lib/groupTheme'
import type { Conversation } from '../../types'
import { Loading } from '../../components/Loading'
import { ErrorBanner } from '../../components/ErrorBanner'
import { EmptyState } from '../../components/EmptyState'

export function StudentMessages() {
  const { session } = useAuth()
  const [err, setErr] = useState<string | null>(null)
  const [rows, setRows] = useState<Conversation[]>([])
  const [accentByGroupId, setAccentByGroupId] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let ok = true
    ;(async () => {
      if (!session?.user?.id) {
        setLoading(false)
        return
      }
      const { data: parts, error: pErr } = await supabase
        .from('conversation_participants')
        .select('conversation_id')
        .eq('user_id', session.user.id)
      if (!ok) return
      if (pErr) {
        setErr(pErr.message)
        setLoading(false)
        return
      }
      const ids = [...new Set((parts ?? []).map((p) => p.conversation_id))]
      if (ids.length === 0) {
        setRows([])
        setAccentByGroupId({})
        setLoading(false)
        return
      }
      const { data: convs, error: cErr } = await supabase
        .from('conversations')
        .select('*')
        .in('id', ids)
        .order('created_at', { ascending: false })
      if (!ok) return
      setErr(cErr?.message ?? null)
      const list = (convs as Conversation[]) ?? []
      const gids = [...new Set(list.map((c) => c.group_id).filter(Boolean))]
      const acc: Record<string, string> = {}
      if (gids.length > 0) {
        const { data: gs } = await supabase.from('groups').select('id, accent_color').in('id', gids)
        for (const row of gs ?? []) {
          const r = row as { id: string; accent_color: string | null }
          acc[r.id] = normalizeGroupAccent(r.accent_color)
        }
      }
      setAccentByGroupId(acc)
      setRows(list)
      setLoading(false)
    })()
    return () => {
      ok = false
    }
  }, [session?.user?.id])

  if (loading) return <Loading />

  return (
    <div className="page">
      <h1>رسائلي</h1>
      <ErrorBanner message={err} />
      {rows.length === 0 ? (
        <EmptyState title="لا محادثات" hint="افتح فوجاً وارسل رسالة للأستاذ من هناك." />
      ) : (
        <ul className="list-links">
          {rows.map((c) => (
            <li key={c.id}>
              <Link
                to={`/s/messages/${c.id}`}
                className={c.group_id && accentByGroupId[c.group_id] ? 'list-links__link--cohort' : undefined}
                style={
                  c.group_id && accentByGroupId[c.group_id]
                    ? cohortListLinkAccentStyle(accentByGroupId[c.group_id])
                    : undefined
                }
              >
                {c.subject ?? 'محادثة'}
                {c.conversation_type === 'student_coordinator' ? (
                  <span className="badge">طالب — منسق</span>
                ) : null}
                <span className="badge">{c.status === 'open' ? 'مفتوحة' : 'مغلقة'}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
