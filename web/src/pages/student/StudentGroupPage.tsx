import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import type { Group, Material, Post, ScheduleEvent } from '../../types'
import { cohortPageSurfaceStyle, normalizeGroupAccent } from '../../lib/groupTheme'
import { scheduleEventCreatorLabel } from '../../lib/scheduleConflict'
import { PeerContactLines } from '../../components/PeerContactLines'
import { Loading } from '../../components/Loading'
import { ErrorBanner } from '../../components/ErrorBanner'
import { EmptyState } from '../../components/EmptyState'

type VisiblePeerRow = {
  user_id: string
  full_name: string | null
  role_in_group: string
  phone: string | null
  whatsapp: string | null
  email: string | null
  student_number: string | null
}

export function StudentGroupPage() {
  const { id } = useParams<{ id: string }>()
  const { session } = useAuth()
  const nav = useNavigate()
  const [err, setErr] = useState<string | null>(null)
  const [group, setGroup] = useState<Group | null>(null)
  const [role, setRole] = useState<string>('')
  const [posts, setPosts] = useState<Post[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [scheduleEvents, setScheduleEvents] = useState<ScheduleEvent[]>([])
  const [loading, setLoading] = useState(true)

  const [msgSubject, setMsgSubject] = useState('')
  const [msgBody, setMsgBody] = useState('')
  const [msgKind, setMsgKind] = useState('question')
  const [msgBusy, setMsgBusy] = useState(false)

  const [wallTitle, setWallTitle] = useState('')
  const [wallContent, setWallContent] = useState('')
  const [wallBusy, setWallBusy] = useState(false)
  const [leaveBusy, setLeaveBusy] = useState(false)
  const [workspaceSlug, setWorkspaceSlug] = useState<string | null>(null)
  const [groupTeachers, setGroupTeachers] = useState<{ id: string; full_name: string }[]>([])
  const [selectedTeacherId, setSelectedTeacherId] = useState('')
  const [visiblePeers, setVisiblePeers] = useState<VisiblePeerRow[]>([])
  const [selectedCoordId, setSelectedCoordId] = useState('')
  const [coordMsgKind, setCoordMsgKind] = useState('question')
  const [coordMsgSubject, setCoordMsgSubject] = useState('')
  const [coordMsgBody, setCoordMsgBody] = useState('')
  const [coordBusy, setCoordBusy] = useState(false)
  const [selectedStudentId, setSelectedStudentId] = useState('')
  const [studMsgKind, setStudMsgKind] = useState('note')
  const [studMsgSubject, setStudMsgSubject] = useState('')
  const [studMsgBody, setStudMsgBody] = useState('')
  const [studBusy, setStudBusy] = useState(false)

  /** من بداية اليوم المحلي حتى نهاية اليوم + 14 يوماً (كان الفلتر يوماً واحداً فقط فيخفي الحصص). */
  const scheduleRange = useMemo(() => {
    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 14, 23, 59, 59, 999)
    return { start: start.toISOString(), end: end.toISOString() }
  }, [])

  async function reload() {
    if (!id || !session?.user?.id) {
      setLoading(false)
      return
    }
    setLoading(true)
    const { data: mem, error: mErr } = await supabase
      .from('group_members')
      .select('role_in_group')
      .eq('group_id', id)
      .eq('user_id', session.user.id)
      .maybeSingle()
    if (mErr || !mem) {
      setErr('لست عضواً في هذا الفوج')
      setLoading(false)
      return
    }
    const r = mem.role_in_group as string
    setRole(r)
    let peers: VisiblePeerRow[] = []
    let contactRpcErr: string | null = null
    if (r === 'student' || r === 'coordinator') {
      const { data: pr, error: prErr } = await supabase.rpc('list_group_visible_contacts', {
        p_group_id: id,
      })
      if (prErr) contactRpcErr = prErr.message
      else peers = (pr as VisiblePeerRow[]) ?? []
    }
    setVisiblePeers(peers)
    const { data: g, error: gErr } = await supabase.from('groups').select('*').eq('id', id).single()
    if (gErr || !g) {
      setErr('فوج غير موجود')
      setLoading(false)
      return
    }
    const grp = g as Group
    setGroup(grp)
    const ws = grp.workspace_id

    const { data: wsRow, error: wsErr } = await supabase
      .from('workspaces')
      .select('slug, owner_teacher_id')
      .eq('id', ws)
      .single()
    if (wsErr) {
      setWorkspaceSlug(null)
      setGroupTeachers([])
      setSelectedTeacherId('')
    } else {
      const w = wsRow as { slug: string | null; owner_teacher_id: string }
      setWorkspaceSlug(w.slug?.trim() || null)
      const ownerId = w.owner_teacher_id
      const { data: ownerProf } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('id', ownerId)
        .maybeSingle()
      const { data: staffRows, error: stErr } = await supabase
        .from('group_staff')
        .select('teacher_id, profiles(id, full_name)')
        .eq('group_id', id)
        .eq('status', 'active')
      const list: { id: string; full_name: string }[] = []
      if (ownerProf) {
        const op = ownerProf as { id: string; full_name: string }
        list.push({ id: op.id, full_name: op.full_name?.trim() || 'أستاذ المساحة' })
      }
      if (!stErr && staffRows?.length) {
        for (const row of staffRows) {
          const tid = row.teacher_id as string
          if (tid === ownerId) continue
          const prof = row.profiles as { full_name?: string | null } | { full_name?: string | null }[] | null
          const p = Array.isArray(prof) ? prof[0] : prof
          const fn = p?.full_name?.trim() || 'أستاذ'
          list.push({ id: tid, full_name: fn })
        }
      }
      setGroupTeachers(list)
      setSelectedTeacherId((prev) => {
        if (prev && list.some((t) => t.id === prev)) return prev
        return list[0]?.id ?? ''
      })
    }

    const [p, mat, ev] = await Promise.all([
      supabase
        .from('posts')
        .select('*')
        .eq('workspace_id', ws)
        .is('deleted_at', null)
        .or(`group_id.eq.${id},scope.eq.workspace`)
        .order('pinned', { ascending: false })
        .order('created_at', { ascending: false }),
      supabase.from('materials').select('*').eq('group_id', id).order('created_at', { ascending: false }),
      supabase
        .from('schedule_events')
        .select('*, profiles:profiles!schedule_events_created_by_fkey(full_name)')
        .eq('group_id', id)
        .gte('starts_at', scheduleRange.start)
        .lte('starts_at', scheduleRange.end)
        .order('starts_at', { ascending: true }),
    ])
    setErr(
      contactRpcErr ?? p.error?.message ?? mat.error?.message ?? ev.error?.message ?? null,
    )
    setPosts((p.data as Post[]) ?? [])
    setMaterials((mat.data as Material[]) ?? [])
    setScheduleEvents((ev.data as ScheduleEvent[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    void reload()
  }, [id, session?.user?.id])

  useEffect(() => {
    if (role !== 'student') return
    const ids = visiblePeers.map((p) => p.user_id)
    setSelectedCoordId((prev) => (prev && ids.includes(prev) ? prev : ids[0] ?? ''))
  }, [role, visiblePeers])

  useEffect(() => {
    if (role !== 'coordinator') return
    const ids = visiblePeers.map((p) => p.user_id)
    setSelectedStudentId((prev) => (prev && ids.includes(prev) ? prev : ids[0] ?? ''))
  }, [role, visiblePeers])

  async function downloadMaterial(m: Material) {
    if (!m.file_path) return
    const { data, error } = await supabase.storage.from('materials').createSignedUrl(m.file_path, 3600)
    if (error) {
      setErr(error.message)
      return
    }
    if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  async function submitWallPost(e: React.FormEvent) {
    e.preventDefault()
    if (!group || !session?.user?.id || !id || !wallContent.trim()) return
    setWallBusy(true)
    setErr(null)
    const { error } = await supabase.from('posts').insert({
      workspace_id: group.workspace_id,
      group_id: id,
      author_id: session.user.id,
      scope: 'group',
      title: wallTitle.trim() || null,
      content: wallContent.trim(),
      post_type: 'general',
    })
    setWallBusy(false)
    if (error) {
      setErr(error.message)
      return
    }
    setWallTitle('')
    setWallContent('')
    await reload()
  }

  async function leaveGroup() {
    if (!id) return
    if (!window.confirm('هل تريد مغادرة هذا الفوج؟ يمكنك الانضمام لاحقاً بكود جديد إن احتجت.')) return
    setLeaveBusy(true)
    setErr(null)
    const { error } = await supabase.rpc('leave_student_group', { p_group_id: id })
    setLeaveBusy(false)
    if (error) {
      if (error.message.includes('not_an_active_student_in_group')) {
        setErr('تعذّر المغادرة — تحقق من أنك طالب نشط في هذا الفوج.')
      } else {
        setErr(error.message)
      }
      return
    }
    nav('/s', { replace: true })
  }

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault()
    if (!id) return
    if (!selectedTeacherId) {
      setErr('اختر الأستاذ المراد مراسلته')
      return
    }
    setMsgBusy(true)
    setErr(null)
    const { data, error } = await supabase.rpc('start_conversation_with_teacher', {
      p_group_id: id,
      p_teacher_id: selectedTeacherId,
      p_message_kind: msgKind,
      p_subject: msgSubject.trim() || 'بدون عنوان',
      p_body: msgBody.trim(),
    })
    setMsgBusy(false)
    if (error) {
      if (error.message.includes('teacher_not_in_group_workspace')) {
        setErr('لا يمكن مراسلة هذا الأستاذ من هذا الفوج.')
      } else if (error.message.includes('invalid_teacher')) {
        setErr('اختيار الأستاذ غير صالح.')
      } else {
        setErr(error.message)
      }
      return
    }
    const cid = data as string
    setMsgSubject('')
    setMsgBody('')
    nav(`/s/messages/${cid}`)
  }

  async function sendMessageToCoordinator(e: React.FormEvent) {
    e.preventDefault()
    if (!id) return
    if (!selectedCoordId) {
      setErr('اختر المنسق')
      return
    }
    setCoordBusy(true)
    setErr(null)
    const { data, error } = await supabase.rpc('start_conversation_with_coordinator', {
      p_group_id: id,
      p_coordinator_id: selectedCoordId,
      p_message_kind: coordMsgKind,
      p_subject: coordMsgSubject.trim() || 'بدون عنوان',
      p_body: coordMsgBody.trim(),
    })
    setCoordBusy(false)
    if (error) {
      if (error.message.includes('peer_not_coordinator')) {
        setErr('المختار ليس منسقاً في هذا الفوج.')
      } else if (error.message.includes('only_students_message_coordinator')) {
        setErr('مراسلة المنسق متاحة للطلبة فقط.')
      } else if (error.message.includes('invalid_coordinator')) {
        setErr('اختيار المنسق غير صالح.')
      } else {
        setErr(error.message)
      }
      return
    }
    const cid = data as string
    setCoordMsgSubject('')
    setCoordMsgBody('')
    nav(`/s/messages/${cid}`)
  }

  async function sendMessageToStudent(e: React.FormEvent) {
    e.preventDefault()
    if (!id) return
    if (!selectedStudentId) {
      setErr('اختر الطالب')
      return
    }
    setStudBusy(true)
    setErr(null)
    const { data, error } = await supabase.rpc('start_conversation_with_student', {
      p_group_id: id,
      p_student_id: selectedStudentId,
      p_message_kind: studMsgKind,
      p_subject: studMsgSubject.trim() || 'بدون عنوان',
      p_body: studMsgBody.trim(),
    })
    setStudBusy(false)
    if (error) {
      if (error.message.includes('peer_not_student')) {
        setErr('المختار ليس طالباً نشطاً في هذا الفوج.')
      } else if (error.message.includes('only_coordinators_message_students')) {
        setErr('مراسلة الطلبة بهذه الطريقة متاحة للمنسق فقط.')
      } else if (error.message.includes('invalid_student')) {
        setErr('اختيار الطالب غير صالح.')
      } else {
        setErr(error.message)
      }
      return
    }
    const cid = data as string
    setStudMsgSubject('')
    setStudMsgBody('')
    nav(`/s/messages/${cid}`)
  }

  if (loading) return <Loading />
  if (!group) return <EmptyState title="غير متاح" />

  return (
    <div className="page page--cohort" style={cohortPageSurfaceStyle(normalizeGroupAccent(group.accent_color))}>
      <p className="breadcrumb">
        <Link to="/s">الرئيسية</Link> / {group.group_name}
      </p>
      <h1>
        {group.group_name}
        {role === 'coordinator' ? <span className="pill pill--coord">منسق</span> : null}
      </h1>
      {role === 'student' ? (
        <p>
          <button type="button" className="btn btn--ghost btn--small" disabled={leaveBusy} onClick={() => void leaveGroup()}>
            {leaveBusy ? 'جاري المغادرة…' : 'مغادرة الفوج'}
          </button>
        </p>
      ) : null}
      <ErrorBanner message={err} />

      {role === 'student' ? (
        <section className="section">
          <h2>المنسقون</h2>
          {visiblePeers.length === 0 ? (
            <p className="muted small">
              لا يوجد منسق معيّن في هذا الفوج بعد. يمكنك مراسلة الأستاذ من القسم «الأساتذة والتواصل» أدناه.
            </p>
          ) : (
            <>
              <ul className="student-peer-cards">
                {visiblePeers.map((c) => (
                  <li key={c.user_id} className="student-peer-card">
                    <strong>{c.full_name?.trim() || 'منسق'}</strong>
                    <PeerContactLines
                      phone={c.phone}
                      whatsapp={c.whatsapp}
                      email={c.email}
                      showStudentNumber={false}
                    />
                  </li>
                ))}
              </ul>
              <h3 className="student-peer-card__msg-title">مراسلة المنسق</h3>
              <form className="form" onSubmit={(ev) => void sendMessageToCoordinator(ev)}>
                <label>
                  المنسق
                  <select
                    value={selectedCoordId}
                    onChange={(e) => setSelectedCoordId(e.target.value)}
                    required
                    disabled={visiblePeers.length === 0}
                  >
                    {visiblePeers.map((c) => (
                      <option key={c.user_id} value={c.user_id}>
                        {c.full_name?.trim() || 'منسق'}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  نوع الرسالة
                  <select value={coordMsgKind} onChange={(e) => setCoordMsgKind(e.target.value)}>
                    <option value="question">سؤال</option>
                    <option value="suggestion">اقتراح</option>
                    <option value="complaint">شكاية</option>
                    <option value="research">بحث / طلب</option>
                  </select>
                </label>
                <label>
                  الموضوع
                  <input value={coordMsgSubject} onChange={(e) => setCoordMsgSubject(e.target.value)} />
                </label>
                <label>
                  النص
                  <textarea rows={4} value={coordMsgBody} onChange={(e) => setCoordMsgBody(e.target.value)} required />
                </label>
                <button type="submit" className="btn btn--primary" disabled={coordBusy}>
                  {coordBusy ? 'جاري الإرسال…' : 'إرسال للمنسق'}
                </button>
              </form>
            </>
          )}
        </section>
      ) : null}

      {role === 'coordinator' ? (
        <section className="section">
          <h2>الطلبة وبيانات التواصل</h2>
          <p className="muted small">
            الهاتف والواتساب والبريد من ملف كل طالب؛ البريد المعروض هو بريد تسجيل الحساب في المنصة.
          </p>
          {visiblePeers.length === 0 ? (
            <p className="muted small">لا يوجد طلبة نشطون في هذا الفوج حالياً.</p>
          ) : (
            <>
              <ul className="student-peer-cards">
                {visiblePeers.map((s) => (
                  <li key={s.user_id} className="student-peer-card">
                    <strong>{s.full_name?.trim() || 'طالب'}</strong>
                    <PeerContactLines
                      phone={s.phone}
                      whatsapp={s.whatsapp}
                      email={s.email}
                      studentNumber={s.student_number}
                    />
                  </li>
                ))}
              </ul>
              <h3 className="student-peer-card__msg-title">مراسلة طالب</h3>
              <form className="form" onSubmit={(ev) => void sendMessageToStudent(ev)}>
                <label>
                  الطالب
                  <select
                    value={selectedStudentId}
                    onChange={(e) => setSelectedStudentId(e.target.value)}
                    required
                    disabled={visiblePeers.length === 0}
                  >
                    {visiblePeers.map((s) => (
                      <option key={s.user_id} value={s.user_id}>
                        {s.full_name?.trim() || 'طالب'}
                        {s.student_number?.trim() ? ` — ${s.student_number.trim()}` : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  نوع الرسالة
                  <select value={studMsgKind} onChange={(e) => setStudMsgKind(e.target.value)}>
                    <option value="note">تنبيه / ملاحظة</option>
                    <option value="question">سؤال</option>
                    <option value="suggestion">اقتراح</option>
                  </select>
                </label>
                <label>
                  الموضوع
                  <input value={studMsgSubject} onChange={(e) => setStudMsgSubject(e.target.value)} />
                </label>
                <label>
                  النص
                  <textarea rows={4} value={studMsgBody} onChange={(e) => setStudMsgBody(e.target.value)} required />
                </label>
                <button type="submit" className="btn btn--primary" disabled={studBusy}>
                  {studBusy ? 'جاري الإرسال…' : 'إرسال للطالب'}
                </button>
              </form>
            </>
          )}
        </section>
      ) : null}

      <section className="section">
        <h2>ما الجديد (الحائط)</h2>
        {role === 'coordinator' ? (
          <>
            <h3>نشر على حائط الفوج</h3>
            <p className="muted small">يظهر منشورك لجميع أعضاء الفوج والأستاذ.</p>
            <form className="form" onSubmit={submitWallPost}>
              <label>
                عنوان (اختياري)
                <input value={wallTitle} onChange={(e) => setWallTitle(e.target.value)} />
              </label>
              <label>
                المحتوى
                <textarea
                  rows={3}
                  value={wallContent}
                  onChange={(e) => setWallContent(e.target.value)}
                  required
                />
              </label>
              <button type="submit" className="btn btn--primary" disabled={wallBusy}>
                {wallBusy ? 'جاري النشر…' : 'نشر'}
              </button>
            </form>
          </>
        ) : (
          <p className="muted">النشر على حائط الفوج متاح للمنسق فقط. يمكنك قراءة المنشورات أدناه.</p>
        )}
        {posts.length === 0 ? (
          <EmptyState title="لا منشورات" />
        ) : (
          <ul className="post-list">
            {posts.map((p) => (
              <li key={p.id} className="post-card">
                {p.title ? <h3>{p.title}</h3> : null}
                <p>{p.content}</p>
                <time className="muted">{new Date(p.created_at).toLocaleString('ar-MA')}</time>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="section">
        <h2>الحصص القادمة</h2>
        <p className="muted">خلال الأيام الأربعة عشر القادمة (بتوقيت جهازك).</p>
        {scheduleEvents.length === 0 ? (
          <EmptyState title="لا حصص مجدولة في هذه الفترة" />
        ) : (
          <ul className="schedule-list">
            {scheduleEvents.map((ev) => (
              <li key={ev.id}>
                <strong>{ev.subject_name ?? 'حصة'}</strong> — {scheduleEventCreatorLabel(ev)} —{' '}
                {new Date(ev.starts_at).toLocaleTimeString('ar-MA', { hour: '2-digit', minute: '2-digit' })} —{' '}
                <span className="muted">{ev.mode === 'online' ? 'عن بُعد' : 'حضوري'}</span>
                {ev.mode === 'online' && ev.meeting_link ? (
                  <>
                    {' '}
                    <a href={ev.meeting_link} target="_blank" rel="noreferrer">
                      رابط
                    </a>
                  </>
                ) : null}
                {ev.location ? <span className="muted"> — {ev.location}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="section">
        <h2>المواد</h2>
        {materials.length === 0 ? (
          <EmptyState title="لا ملفات بعد" />
        ) : (
          <ul>
            {materials.map((m) => (
              <li key={m.id}>
                {m.title}{' '}
                {m.file_path ? (
                  <button type="button" className="btn btn--ghost" onClick={() => void downloadMaterial(m)}>
                    تحميل / فتح
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {role !== 'teacher' ? (
        <section className="section section--message">
          <h2>الأساتذة والتواصل</h2>
          {workspaceSlug ? (
            <p className="muted small">
              الصفحة الرسمية للمساحة (ملف الأستاذ المسؤول والمحتوى العام):{' '}
              <Link className="btn btn--secondary btn--small" to={`/p/${encodeURIComponent(workspaceSlug)}`}>
                فتح الصفحة العامة
              </Link>
            </p>
          ) : (
            <p className="muted small">لا يتوفر رابط عام للمساحة حالياً.</p>
          )}
          {groupTeachers.length > 0 ? (
            <ul className="student-group__teachers muted small">
              {groupTeachers.map((t) => (
                <li key={t.id}>
                  <strong>{t.full_name}</strong>
                  {workspaceSlug ? (
                    <>
                      {' '}
                      —{' '}
                      <Link to={`/p/${encodeURIComponent(workspaceSlug)}`}>الصفحة العامة للمساحة</Link>
                    </>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
          <h3>مراسلة أستاذ</h3>
          <p className="muted small">
            {role === 'coordinator'
              ? 'اختر الأستاذ لفتح قناة «منسق — أستاذ».'
              : 'اختر الأستاذ لفتح تذكرة خاصة معه.'}
          </p>
          <form className="form" onSubmit={sendMessage}>
            <label>
              الأستاذ
              <select
                value={selectedTeacherId}
                onChange={(e) => setSelectedTeacherId(e.target.value)}
                required
                disabled={groupTeachers.length === 0}
              >
                {groupTeachers.length === 0 ? (
                  <option value="">لا يوجد أساتذة مرتبطون</option>
                ) : (
                  groupTeachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.full_name}
                    </option>
                  ))
                )}
              </select>
            </label>
            <label>
              نوع الرسالة
              <select value={msgKind} onChange={(e) => setMsgKind(e.target.value)}>
                <option value="question">سؤال</option>
                <option value="suggestion">اقتراح</option>
                <option value="complaint">شكاية</option>
                <option value="research">بحث / طلب</option>
              </select>
            </label>
            <label>
              الموضوع
              <input value={msgSubject} onChange={(e) => setMsgSubject(e.target.value)} />
            </label>
            <label>
              النص
              <textarea rows={4} value={msgBody} onChange={(e) => setMsgBody(e.target.value)} required />
            </label>
            <button
              type="submit"
              className="btn btn--primary"
              disabled={msgBusy || groupTeachers.length === 0}
            >
              {msgBusy ? 'جاري الإرسال…' : 'إرسال'}
            </button>
          </form>
        </section>
      ) : null}
    </div>
  )
}
