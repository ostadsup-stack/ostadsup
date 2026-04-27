import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { formatAppDateTime } from '../../lib/appDateTime'
import { cohortPageSurfaceStyle, DEFAULT_GROUP_ACCENT, normalizeGroupAccent } from '../../lib/groupTheme'
import type { Message, Profile } from '../../types'
import { Loading } from '../../components/Loading'
import { ErrorBanner } from '../../components/ErrorBanner'
import { EmptyState } from '../../components/EmptyState'

export function TeacherGroupStaffPage() {
  const { id } = useParams<{ id: string }>()
  const { session } = useAuth()
  const [err, setErr] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [profiles, setProfiles] = useState<Record<string, Profile>>({})
  const [body, setBody] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [convId, setConvId] = useState<string | null>(null)
  const [cohortAccent, setCohortAccent] = useState<string>(DEFAULT_GROUP_ACCENT)

  const reload = useCallback(async () => {
    if (!id || !session?.user?.id) {
      setLoading(false)
      return
    }
    setLoading(true)
    setErr(null)
    const { data: gAccent, error: gErr } = await supabase
      .from('groups')
      .select('accent_color')
      .eq('id', id)
      .maybeSingle()
    setCohortAccent(
      normalizeGroupAccent(
        !gErr && gAccent ? (gAccent as { accent_color: string | null }).accent_color : null,
      ),
    )
    const { data: conv, error: cErr } = await supabase
      .from('conversations')
      .select('id')
      .eq('group_id', id)
      .eq('conversation_type', 'teacher_staff')
      .maybeSingle()
    if (cErr) {
      setErr(cErr.message)
      setLoading(false)
      return
    }
    const cid = (conv as { id: string } | null)?.id ?? null
    setConvId(cid)
    if (!cid) {
      setMessages([])
      setLoading(false)
      return
    }
    const { data: msgs, error: mErr } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', cid)
      .order('created_at', { ascending: true })
    if (mErr) {
      setErr(mErr.message)
      setLoading(false)
      return
    }
    const list = (msgs as Message[]) ?? []
    setMessages(list)
    await supabase.rpc('mark_conversation_messages_read', { p_conversation_id: cid })
    const ids = [...new Set(list.map((m) => m.sender_id))]
    if (ids.length) {
      const { data: profs } = await supabase.from('profiles').select('*').in('id', ids)
      const map: Record<string, Profile> = {}
      ;((profs as Profile[]) ?? []).forEach((p) => {
        map[p.id] = p
      })
      setProfiles(map)
    }
    setLoading(false)
  }, [id, session?.user?.id])

  useEffect(() => {
    void reload()
  }, [reload])

  async function send(e: React.FormEvent) {
    e.preventDefault()
    if (!id || !body.trim()) return
    setSending(true)
    setErr(null)
    const { error } = await supabase.rpc('post_teacher_staff_message', {
      p_group_id: id,
      p_body: body.trim(),
    })
    setSending(false)
    if (error) {
      setErr(error.message)
      return
    }
    setBody('')
    await reload()
  }

  if (!session?.user?.id) return <Loading />
  if (loading) return <Loading />

  return (
    <div className="page page--cohort" style={cohortPageSurfaceStyle(cohortAccent)}>
      <p className="breadcrumb">
        <Link to="/t/groups">الأفواج</Link> / <Link to={`/t/groups/${id}`}>الفوج</Link> / طاقم التدريس
      </p>
      <h1>محادثة طاقم التدريس</h1>
      <p className="muted small">رسائل خاصة بين أساتذة هذا الفوج فقط.</p>
      <ErrorBanner message={err} />
      {convId ? (
        <p style={{ marginBottom: '1rem' }}>
          <Link to={`/t/inbox/${convId}`} className="btn btn--ghost">
            فتح في صندوق المحادثات
          </Link>
        </p>
      ) : null}
      <div className="thread-shell">
        <div className="thread-shell__scroll">
          {messages.length === 0 && !convId ? (
            <EmptyState
              title="لا رسائل بعد"
              hint="أرسل أول رسالة لفتح قناة الطاقم مع باقي الأساتذة المرتبطين بهذا الفوج."
            />
          ) : (
            <div className="thread">
              {messages.map((m) => (
                <div key={m.id} className="bubble">
                  <div className="bubble__meta">
                    {profiles[m.sender_id]?.full_name ?? m.sender_id}{' '}
                    <span className="muted">{m.message_kind}</span>
                  </div>
                  <p>{m.body}</p>
                  <time className="muted">{formatAppDateTime(m.created_at)}</time>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="thread-shell__composer">
          <form className="form form--thread-composer" onSubmit={(ev) => void send(ev)}>
            <label>
              رسالة للطاقم
              <textarea rows={2} value={body} onChange={(e) => setBody(e.target.value)} required />
            </label>
            <button type="submit" className="btn btn--primary thread-shell__send" disabled={sending}>
              {sending ? 'جاري الإرسال…' : 'إرسال'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
