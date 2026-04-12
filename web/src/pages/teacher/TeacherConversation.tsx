import { useEffect, useState, type CSSProperties } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { cohortPageSurfaceStyle, normalizeGroupAccent } from '../../lib/groupTheme'
import type { Conversation, Message, Profile } from '../../types'
import { Loading } from '../../components/Loading'
import { ErrorBanner } from '../../components/ErrorBanner'
import { EmptyState } from '../../components/EmptyState'

export function TeacherConversation() {
  const { id } = useParams<{ id: string }>()
  const { session } = useAuth()
  const [err, setErr] = useState<string | null>(null)
  const [conv, setConv] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [profiles, setProfiles] = useState<Record<string, Profile>>({})
  const [body, setBody] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [coordinatorIds, setCoordinatorIds] = useState<Set<string>>(new Set())
  const [cohortSurface, setCohortSurface] = useState<CSSProperties | null>(null)

  async function reload() {
    if (!id || !session?.user?.id) {
      setLoading(false)
      return
    }
    setLoading(true)
    const { data: c, error: cErr } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', id)
      .single()
    if (cErr || !c) {
      setErr('محادثة غير موجودة')
      setLoading(false)
      return
    }
    const convRow = c as Conversation
    setConv(convRow)
    if (convRow.group_id) {
      const { data: gRow } = await supabase
        .from('groups')
        .select('accent_color')
        .eq('id', convRow.group_id)
        .maybeSingle()
      setCohortSurface(
        cohortPageSurfaceStyle(
          normalizeGroupAccent((gRow as { accent_color: string | null } | null)?.accent_color),
        ),
      )
    } else {
      setCohortSurface(null)
    }
    const { data: msgs, error: mErr } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', id)
      .order('created_at', { ascending: true })
    setErr(mErr?.message ?? null)
    const list = (msgs as Message[]) ?? []
    setMessages(list)
    await supabase.rpc('mark_conversation_messages_read', { p_conversation_id: id })
    const ids = [...new Set(list.map((m) => m.sender_id))]
    let coord = new Set<string>()
    if (convRow.group_id && ids.length) {
      const { data: cm } = await supabase
        .from('group_members')
        .select('user_id')
        .eq('group_id', convRow.group_id)
        .eq('role_in_group', 'coordinator')
        .in('user_id', ids)
      for (const row of cm ?? []) {
        if (row.user_id) coord.add(row.user_id)
      }
    }
    setCoordinatorIds(coord)
    if (ids.length) {
      const { data: profs } = await supabase.from('profiles').select('*').in('id', ids)
      const map: Record<string, Profile> = {}
      ;((profs as Profile[]) ?? []).forEach((p) => {
        map[p.id] = p
      })
      setProfiles(map)
    }
    setLoading(false)
  }

  useEffect(() => {
    void reload()
  }, [id, session?.user?.id])

  async function sendReply(e: React.FormEvent) {
    e.preventDefault()
    if (!id || !session?.user?.id || !body.trim()) return
    setSending(true)
    setErr(null)
    const { error } = await supabase.from('messages').insert({
      conversation_id: id,
      sender_id: session.user.id,
      message_kind: 'reply',
      body: body.trim(),
    })
    setSending(false)
    if (error) {
      setErr(error.message)
      return
    }
    setBody('')
    await reload()
  }

  if (loading) return <Loading />
  if (!conv) return <EmptyState title="غير موجود" />

  return (
    <div className={cohortSurface ? 'page page--cohort' : 'page'} style={cohortSurface ?? undefined}>
      <p className="breadcrumb">
        <Link to="/t/inbox">الرسائل</Link> / {conv.subject ?? 'محادثة'}
      </p>
      <h1>{conv.subject ?? 'محادثة'}</h1>
      <ErrorBanner message={err} />
      <div className="thread-shell">
        <div className="thread-shell__scroll">
          <div className="thread">
            {messages.map((m) => (
              <div
                key={m.id}
                className={coordinatorIds.has(m.sender_id) ? 'bubble bubble--coordinator' : 'bubble'}
              >
                <div className="bubble__meta">
                  {profiles[m.sender_id]?.full_name ?? m.sender_id}
                  {coordinatorIds.has(m.sender_id) ? (
                    <span className="pill pill--coord">منسق</span>
                  ) : null}{' '}
                  <span className="muted">
                    {conv && conv.conversation_type === 'teacher_staff' ? 'طاقم' : m.message_kind}
                  </span>
                </div>
                <p>{m.body}</p>
                <time className="muted">{new Date(m.created_at).toLocaleString('ar-MA')}</time>
              </div>
            ))}
          </div>
        </div>
        <div className="thread-shell__composer">
          <form className="form form--thread-composer" onSubmit={sendReply}>
            <label>
              ردك
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
