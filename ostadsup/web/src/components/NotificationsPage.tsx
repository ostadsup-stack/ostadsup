import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import type { NotificationRow } from '../types'
import { Loading } from './Loading'
import { ErrorBanner } from './ErrorBanner'
import { EmptyState } from './EmptyState'

export function NotificationsPage() {
  const { session } = useAuth()
  const [err, setErr] = useState<string | null>(null)
  const [rows, setRows] = useState<NotificationRow[]>([])
  const [loading, setLoading] = useState(true)

  async function reload() {
    if (!session?.user?.id) {
      setLoading(false)
      return
    }
    setLoading(true)
    const { data, error } = await supabase
      .from('notifications')
      .select('id,title,body,is_read,created_at,target_type')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })
      .limit(80)
    setErr(error?.message ?? null)
    setRows((data as NotificationRow[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    void reload()
  }, [session?.user?.id])

  async function markRead(n: NotificationRow) {
    if (n.is_read) return
    const { error } = await supabase.from('notifications').update({ is_read: true }).eq('id', n.id)
    if (error) setErr(error.message)
    else await reload()
  }

  async function markAll() {
    if (!session?.user?.id) return
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', session.user.id)
      .eq('is_read', false)
    if (error) setErr(error.message)
    else await reload()
  }

  if (loading) return <Loading />

  return (
    <div className="page">
      <h1>الإشعارات</h1>
      <ErrorBanner message={err} />
      {rows.some((r) => !r.is_read) ? (
        <button type="button" className="btn btn--secondary" onClick={() => void markAll()}>
          تعيين الكل كمقروء
        </button>
      ) : null}
      {rows.length === 0 ? (
        <EmptyState title="لا إشعارات" />
      ) : (
        <ul className="notif-list">
          {rows.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                className={`notif ${n.is_read ? '' : 'notif--unread'}`}
                onClick={() => void markRead(n)}
              >
                <strong>{n.title}</strong>
                {n.body ? <p>{n.body}</p> : null}
                <time className="muted">{new Date(n.created_at).toLocaleString('ar-MA')}</time>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
