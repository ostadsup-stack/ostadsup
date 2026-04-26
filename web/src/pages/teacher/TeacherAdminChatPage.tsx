import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { Loading } from '../../components/Loading'
import { ErrorBanner } from '../../components/ErrorBanner'
import { markAdminChatPeerReadForTeacher } from '../../lib/teacherAppAdminChatInbox'
import { IconSend } from '../../components/NavIcons'

type ChatMessage = {
  id: string
  thread_id: string
  sender_id: string
  body: string
  created_at: string
}

export function TeacherAdminChatPage() {
  const { session } = useAuth()
  const uid = session?.user?.id
  const [err, setErr] = useState<string | null>(null)
  const [threadId, setThreadId] = useState<string | null>(null)
  const [loadingThread, setLoadingThread] = useState(true)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const listEndRef = useRef<HTMLDivElement | null>(null)

  const loadMessages = useCallback(async (tId: string) => {
    setLoadingThread(true)
    setErr(null)
    const { data, error } = await supabase
      .from('admin_chat_messages')
      .select('id, thread_id, sender_id, body, created_at')
      .eq('thread_id', tId)
      .order('created_at', { ascending: true })
    setLoadingThread(false)
    if (error) {
      setErr(error.message)
      setMessages([])
      return
    }
    setMessages((data as ChatMessage[]) ?? [])
    void markAdminChatPeerReadForTeacher(tId)
  }, [])

  useEffect(() => {
    if (!uid) {
      setThreadId(null)
      setLoadingThread(false)
      return
    }
    let ok = true
    ;(async () => {
      setLoadingThread(true)
      setErr(null)
      const { data, error } = await supabase.rpc('ensure_my_admin_chat_thread')
      if (!ok) return
      if (error) {
        setErr(error.message)
        setThreadId(null)
        setMessages([])
        setLoadingThread(false)
        return
      }
      const tId = data as string
      setThreadId(tId)
      await loadMessages(tId)
    })()
    return () => {
      ok = false
    }
  }, [uid, loadMessages])

  useEffect(() => {
    if (!listEndRef.current) return
    listEndRef.current.scrollIntoView({ behavior: 'smooth' })
  }, [messages, threadId])

  async function onSend(e: React.FormEvent) {
    e.preventDefault()
    if (!threadId || !uid || !body.trim()) return
    setSending(true)
    setErr(null)
    const { error } = await supabase.from('admin_chat_messages').insert({
      thread_id: threadId,
      sender_id: uid,
      body: body.trim(),
    })
    setSending(false)
    if (error) {
      setErr(error.message)
      return
    }
    setBody('')
    void loadMessages(threadId)
  }

  if (!uid) return <Loading />

  return (
    <div className="page">
      <p className="breadcrumb">
        <Link to="/t">الرئيسية</Link> / <Link to="/t/inbox">صندوق المحادثات</Link> / مدير التطبيق
      </p>
      <h1>رسالة لمدير التطبيق</h1>
      <p className="muted" style={{ marginTop: '-0.25rem' }}>
        تُرسل هذه الرسائل إلى فريق الإدارة. ستظهر المحادثة أيضاً في لوحة المدير.
      </p>
      <ErrorBanner message={err} />

      <section className="admin-messages__thread teacher-admin-chat" aria-label="محادثة مع المدير">
        <header className="admin-messages__thread-header">
          <h2 className="admin-messages__thread-title">مدير التطبيق</h2>
          <span className="pill admin-messages__thread-pill">دعم</span>
        </header>

        <div className="admin-messages__stream" role="log" aria-live="polite">
          {loadingThread ? (
            <p className="muted">جاري التحميل…</p>
          ) : messages.length === 0 ? (
            <p className="muted">لا رسائل بعد. اكتب أدناه لإرسال أول رسالة.</p>
          ) : (
            messages.map((m) => {
              const mine = m.sender_id === uid
              return (
                <div
                  key={m.id}
                  className={`admin-messages__bubble${mine ? ' admin-messages__bubble--out' : ''}`}
                >
                  <p className="admin-messages__body">{m.body}</p>
                  <time className="admin-messages__time" dateTime={m.created_at}>
                    {new Date(m.created_at).toLocaleString('ar-MA', {
                      timeStyle: 'short',
                      dateStyle: 'short',
                    })}
                  </time>
                </div>
              )
            })
          )}
          <div ref={listEndRef} />
        </div>

        <form className="admin-messages__composer" onSubmit={(e) => void onSend(e)}>
          <div className="admin-messages__input-field">
            <label className="visually-hidden" htmlFor="teacher-admin-msg-input">
              رسالة
            </label>
            <textarea
              id="teacher-admin-msg-input"
              className="admin-messages__input"
              dir="auto"
              rows={2}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="اكتب رسالتك للمدير…"
              disabled={!threadId}
            />
          </div>
          <button
            type="submit"
            className="admin-messages__send btn btn--primary"
            disabled={sending || !body.trim() || !threadId}
            title={threadId && !body.trim() ? 'أدخل نص الرسالة' : undefined}
          >
            {sending ? (
              '…'
            ) : (
              <>
                <IconSend className="admin-messages__send-icon" />
                <span>إرسال</span>
              </>
            )}
          </button>
        </form>
      </section>
    </div>
  )
}
