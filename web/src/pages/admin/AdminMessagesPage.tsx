import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useOutletContext, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { markAdminChatReadForPeer } from '../../lib/adminAdminChatRead'
import type { AdminLayoutOutletContext } from './AdminLayout'
import type { Profile } from '../../types'
import { Loading } from '../../components/Loading'
import { ErrorBanner } from '../../components/ErrorBanner'
import { PageHeader } from '../../components/PageHeader'
import { IconBell, IconSend } from '../../components/NavIcons'

type PeerRow = Pick<Profile, 'id' | 'full_name' | 'role'>

type ChatMessage = {
  id: string
  thread_id: string
  sender_id: string
  body: string
  created_at: string
}

function displayPeerRole(p: PeerRow, coordinatorUserIds: Set<string>) {
  if (p.role === 'teacher') return 'أستاذ'
  if (p.role === 'student' && coordinatorUserIds.has(p.id)) return 'منسق'
  if (p.role === 'student') return 'طالب'
  return p.role
}

type SegmentFilter = 'teachers' | 'coordinators' | 'students' | null

function parseSegment(s: string | null): SegmentFilter {
  if (s === 'teachers' || s === 'coordinators' || s === 'students') return s
  return null
}

function peerMatchesSegment(
  p: PeerRow,
  segment: SegmentFilter,
  coordinatorUserIds: Set<string>,
): boolean {
  if (!segment) return true
  if (segment === 'teachers') return p.role === 'teacher'
  if (segment === 'coordinators') return p.role === 'student' && coordinatorUserIds.has(p.id)
  return p.role === 'student' && !coordinatorUserIds.has(p.id)
}

export function AdminMessagesPage() {
  const octx = useOutletContext<AdminLayoutOutletContext | undefined>()
  const refreshAdminUnread = octx?.refreshAdminUnread ?? (async () => undefined)
  const adminUnreadFromPeer = octx?.adminUnreadFromPeer ?? new Set<string>()
  const [searchParams] = useSearchParams()
  const segment = parseSegment(searchParams.get('filter'))
  const { session } = useAuth()
  const [peers, setPeers] = useState<PeerRow[]>([])
  const [nameQuery, setNameQuery] = useState('')
  const [coordinatorUserIds, setCoordinatorUserIds] = useState<Set<string>>(() => new Set())
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [threadId, setThreadId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loadingThread, setLoadingThread] = useState(false)
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const listEndRef = useRef<HTMLDivElement | null>(null)

  const adminId = session?.user?.id

  const loadPeers = useCallback(async () => {
    if (!adminId) {
      setPeers([])
      return
    }
    setLoadingUsers(true)
    setErr(null)
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, role')
      .in('role', ['student', 'teacher'])
      .neq('id', adminId)
      .order('full_name')
    setLoadingUsers(false)
    if (error) {
      setErr(error.message)
      setPeers([])
      return
    }
    setPeers((data as PeerRow[]) ?? [])
  }, [adminId])

  useEffect(() => {
    void loadPeers()
  }, [loadPeers])

  useEffect(() => {
    const sids = peers.filter((p) => p.role === 'student').map((p) => p.id)
    if (sids.length === 0) {
      setCoordinatorUserIds(new Set())
      return
    }
    let ok = true
    void (async () => {
      const { data, error } = await supabase
        .from('group_members')
        .select('user_id')
        .in('user_id', sids)
        .eq('role_in_group', 'coordinator')
      if (!ok) return
      if (error) {
        setCoordinatorUserIds(new Set())
        return
      }
      setCoordinatorUserIds(
        new Set((data ?? []).map((r) => (r as { user_id: string }).user_id).filter(Boolean) as string[]),
      )
    })()
    return () => {
      ok = false
    }
  }, [peers])

  const loadMessages = useCallback(
    async (tId: string) => {
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
        return false
      }
      setMessages((data as ChatMessage[]) ?? [])
      return true
    },
    [],
  )

  const ensureThread = useCallback(
    async (peerUserId: string) => {
      if (!adminId) return null
      // نفضّل الخيط الذي يعتمده الأستاذ/الطالب (ensure_my_admin_chat_thread) إن وُجد: نفس peer، آخر updated_at
      const { data: byPeer, error: e1 } = await supabase
        .from('admin_chat_threads')
        .select('id')
        .eq('peer_user_id', peerUserId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (e1) {
        setErr(e1.message)
        return null
      }
      if (byPeer?.id) return byPeer.id as string
      const { data: ins, error: e2 } = await supabase
        .from('admin_chat_threads')
        .insert({ admin_id: adminId, peer_user_id: peerUserId })
        .select('id')
        .single()
      if (e2) {
        setErr(e2.message)
        return null
      }
      return (ins as { id: string }).id
    },
    [adminId],
  )

  const openPeer = useCallback(
    async (peerUserId: string) => {
      if (!adminId) return
      setSelectedId(peerUserId)
      setThreadId(null)
      setMessages([])
      setLoadingThread(true)
      setErr(null)
      const t = await ensureThread(peerUserId)
      if (!t) {
        setLoadingThread(false)
        return
      }
      setThreadId(t)
      const loaded = await loadMessages(t)
      if (loaded) {
        void markAdminChatReadForPeer(peerUserId)
        await refreshAdminUnread()
      }
    },
    [adminId, ensureThread, loadMessages, refreshAdminUnread],
  )

  const filteredPeers = useMemo(() => {
    let list = peers.filter((p) => peerMatchesSegment(p, segment, coordinatorUserIds))
    const q = nameQuery.trim().toLowerCase()
    if (!q) return list
    return list.filter((p) => p.full_name?.toLowerCase().includes(q) || p.id.includes(q))
  }, [peers, nameQuery, segment, coordinatorUserIds])

  const selectedPeer = useMemo(
    () => (selectedId ? peers.find((p) => p.id === selectedId) : null),
    [peers, selectedId],
  )

  useEffect(() => {
    if (!listEndRef.current) return
    listEndRef.current.scrollIntoView({ behavior: 'smooth' })
  }, [messages, selectedId, threadId])

  async function onSend(e: React.FormEvent) {
    e.preventDefault()
    if (!threadId || !adminId || !body.trim()) return
    setSending(true)
    setErr(null)
    const { error } = await supabase.from('admin_chat_messages').insert({
      thread_id: threadId,
      sender_id: adminId,
      body: body.trim(),
    })
    setSending(false)
    if (error) {
      setErr(error.message)
      return
    }
    setBody('')
    if (selectedId) await markAdminChatReadForPeer(selectedId)
    const ok = await loadMessages(threadId)
    if (ok) void refreshAdminUnread()
  }

  if (!adminId) return <Loading />

  if (loadingUsers) return <Loading label="جاري تحميل المستخدمين…" />

  return (
    <div className="page">
      <PageHeader
        title="الرسائل"
        subtitle="اختر أستاذاً أو منسقاً أو طالباً، ثم راسل من النافذة. يُحفظ السجل في النظام."
      />
      {segment ? (
        <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">
          <span className="me-1 rounded-md bg-slate-200/80 px-2 py-0.5 text-slate-800 dark:bg-slate-700/80 dark:text-slate-100">
            {segment === 'teachers' ? 'أساتذة فقط' : segment === 'coordinators' ? 'منسقون فقط' : 'طلبة (بدون منسق)'}
          </span>
          <Link to="/admin/messages" className="font-medium text-indigo-600 underline decoration-indigo-500/30 underline-offset-2 hover:text-indigo-500 dark:text-indigo-400">
            عرض الجميع
          </Link>
        </p>
      ) : null}
      <ErrorBanner message={err} />

      <div className="admin-messages">
        <aside className="admin-messages__sidebar" aria-label="مستخدمو الطلاب والأساتذة">
          <input
            type="search"
            className="admin-messages__search"
            placeholder="بحث بالاسم…"
            value={nameQuery}
            onChange={(e) => setNameQuery(e.target.value)}
            aria-label="تصفية القائمة"
          />
          <ul className="admin-messages__peers">
            {filteredPeers.length === 0 ? (
              <li className="muted small admin-messages__empty-hint">لا نتائج</li>
            ) : (
              filteredPeers.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className={`admin-messages__peer${selectedId === p.id ? ' is-active' : ''}`}
                    onClick={() => void openPeer(p.id)}
                  >
                    <span className="admin-messages__peer-name flex min-w-0 items-center gap-1.5">
                      {p.full_name?.trim() || p.id}
                      {adminUnreadFromPeer.has(p.id) ? (
                        <span className="inline-flex shrink-0" title="رسالة جديدة" aria-label="رسالة جديدة">
                          <IconBell className="h-3.5 w-3.5 text-rose-500" />
                        </span>
                      ) : null}
                    </span>
                    <span className="admin-messages__peer-role">{displayPeerRole(p, coordinatorUserIds)}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </aside>

        <section className="admin-messages__thread" aria-label="المحادثة">
          {!selectedId || !selectedPeer ? (
            <p className="admin-messages__placeholder muted">اختر مستخدماً لعرض المحادثة.</p>
          ) : (
            <>
              <header className="admin-messages__thread-header">
                <h2 className="admin-messages__thread-title">{selectedPeer.full_name?.trim() || '—'}</h2>
                <span className="pill admin-messages__thread-pill">
                  {displayPeerRole(selectedPeer, coordinatorUserIds)}
                </span>
              </header>

              <div className="admin-messages__stream" role="log" aria-live="polite">
                {loadingThread ? (
                  <p className="muted">جاري التحميل…</p>
                ) : messages.length === 0 ? (
                  <p className="muted">لا رسائل بعد. اكتب أدناه لإرسال أول رسالة.</p>
                ) : (
                  messages.map((m) => {
                    const mine = m.sender_id === adminId
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
                  <label className="visually-hidden" htmlFor="admin-msg-input">
                    رسالة
                  </label>
                  <textarea
                    id="admin-msg-input"
                    className="admin-messages__input"
                    dir="auto"
                    rows={2}
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder="اكتب رسالتك…"
                  />
                </div>
                <button
                  type="submit"
                  className="admin-messages__send btn btn--primary"
                  disabled={sending || !body.trim() || !threadId}
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
            </>
          )}
        </section>
      </div>
    </div>
  )
}
