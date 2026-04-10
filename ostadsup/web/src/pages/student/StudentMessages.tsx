import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import type { Conversation } from '../../types'
import { Loading } from '../../components/Loading'
import { ErrorBanner } from '../../components/ErrorBanner'
import { EmptyState } from '../../components/EmptyState'

export function StudentMessages() {
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
      setRows((convs as Conversation[]) ?? [])
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
              <Link to={`/s/messages/${c.id}`}>
                {c.subject ?? 'محادثة'}
                <span className="badge">{c.status === 'open' ? 'مفتوحة' : 'مغلقة'}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
