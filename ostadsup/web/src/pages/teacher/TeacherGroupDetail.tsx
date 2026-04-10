import { useEffect, useState } from 'react'
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { fetchWorkspaceForTeacher } from '../../lib/workspace'
import { shareWhatsAppMessage } from '../../lib/workspace'
import { pickContrastingForeground } from '../../lib/colorContrast'
import { nextEndAfterStartChange, scheduleFieldsFromIso } from '../../lib/scheduleFormTimes'
import type { Group, GroupMember, Material, Post, ScheduleEvent, StudyLevel } from '../../types'
import { buildSuggestedCohortCode } from '../../lib/cohortCode'
import { Loading } from '../../components/Loading'
import { ErrorBanner } from '../../components/ErrorBanner'
import { EmptyState } from '../../components/EmptyState'

const DEFAULT_GROUP_ACCENT = '#2563eb'

const emptySchedForm = {
  event_type: 'class' as 'class' | 'seminar',
  subject_name: '',
  mode: 'on_site' as 'on_site' | 'online',
  schedule_date: '',
  start_time: '',
  end_time: '',
  location: '',
  meeting_link: '',
  note: '',
}

export function TeacherGroupDetail() {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const { session } = useAuth()
  const [err, setErr] = useState<string | null>(null)
  const [group, setGroup] = useState<Group | null>(null)
  const [groupOwnerWorkspaceId, setGroupOwnerWorkspaceId] = useState<string | null>(null)
  const [myWorkspaceId, setMyWorkspaceId] = useState<string | null>(null)
  const [isGroupOwner, setIsGroupOwner] = useState(false)
  const [isLinkedStaff, setIsLinkedStaff] = useState(false)
  const [joinUrlStudent, setJoinUrlStudent] = useState('')
  const [teacherLinkSecret, setTeacherLinkSecret] = useState<string | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [rotatingLink, setRotatingLink] = useState(false)
  const [posts, setPosts] = useState<Post[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [events, setEvents] = useState<ScheduleEvent[]>([])
  const [members, setMembers] = useState<GroupMember[]>([])
  const [loading, setLoading] = useState(true)
  const [metaSaving, setMetaSaving] = useState(false)
  const [metaSuggesting, setMetaSuggesting] = useState(false)
  const [metaForm, setMetaForm] = useState({
    study_level: 'licence' as StudyLevel,
    academic_year: '',
    cohort_official_code: '',
    cohort_suffix: '',
    cohort_sequence: '',
    accent_color: DEFAULT_GROUP_ACCENT,
  })

  const [postForm, setPostForm] = useState({
    scope: 'group' as 'group' | 'workspace',
    title: '',
    content: '',
  })
  const [matTitle, setMatTitle] = useState('')
  const [matFile, setMatFile] = useState<File | null>(null)
  const [sched, setSched] = useState({ ...emptySchedForm })
  const [editingEventId, setEditingEventId] = useState<string | null>(null)
  const [editSched, setEditSched] = useState<typeof emptySchedForm | null>(null)
  const [highlightEventId, setHighlightEventId] = useState<string | null>(null)
  const [scheduleEditSaving, setScheduleEditSaving] = useState(false)

  useEffect(() => {
    if (!joinUrlStudent) {
      setQrDataUrl(null)
      return
    }
    let cancelled = false
    void import('qrcode').then((QR) => {
      QR.toDataURL(joinUrlStudent, { margin: 1, width: 200 })
        .then((url) => {
          if (!cancelled) setQrDataUrl(url)
        })
        .catch(() => {
          if (!cancelled) setQrDataUrl(null)
        })
    })
    return () => {
      cancelled = true
    }
  }, [joinUrlStudent])

  useEffect(() => {
    if (location.hash !== '#group-schedule' || loading) return
    const el = document.getElementById('group-schedule')
    if (!el) return
    requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [location.hash, loading])

  async function reload() {
    if (!id || !session?.user?.id) {
      setLoading(false)
      return
    }
    setLoading(true)
    setIsLinkedStaff(false)
    setEditingEventId(null)
    setEditSched(null)
    const { workspace: myWs, error: wErr } = await fetchWorkspaceForTeacher(session.user.id)
    if (wErr || !myWs) {
      setErr(wErr?.message ?? 'مساحة غير موجودة')
      setLoading(false)
      return
    }
    setMyWorkspaceId(myWs.id)

    const { data: g, error: gErr } = await supabase.from('groups').select('*').eq('id', id).single()
    if (gErr || !g) {
      setErr('الفوج غير موجود')
      setLoading(false)
      return
    }

    const { data: linkRow } = await supabase
      .from('group_staff')
      .select('id')
      .eq('group_id', id)
      .eq('teacher_id', session.user.id)
      .eq('status', 'active')
      .maybeSingle()

    const owner = g.workspace_id === myWs.id
    const linked = !!linkRow
    if (!owner && !linked) {
      setErr('الفوج غير موجود أو ليس لديك صلاحية')
      setLoading(false)
      return
    }

    setIsGroupOwner(owner)
    setIsLinkedStaff(linked)
    setGroupOwnerWorkspaceId(g.workspace_id)
    setGroup(g as Group)
    setErr(null)

    const { data: tokRows, error: tokErr } = await supabase.rpc('get_group_invite_tokens', {
      p_group_id: id,
    })
    if (!tokErr && tokRows && Array.isArray(tokRows) && tokRows.length > 0) {
      const tok = tokRows[0] as { student_join_secret: string; teacher_link_secret: string }
      const origin = typeof window !== 'undefined' ? window.location.origin : ''
      setJoinUrlStudent(`${origin}/s/join?t=${encodeURIComponent(tok.student_join_secret)}`)
      setTeacherLinkSecret(tok.teacher_link_secret)
    } else {
      const origin = typeof window !== 'undefined' ? window.location.origin : ''
      setJoinUrlStudent(
        origin ? `${origin}/s/join?code=${encodeURIComponent((g as Group).join_code)}` : '',
      )
      setTeacherLinkSecret(null)
    }

    const [p, m, e, mem] = await Promise.all([
      supabase
        .from('posts')
        .select('*')
        .eq('workspace_id', g.workspace_id)
        .is('deleted_at', null)
        .or(`group_id.eq.${id},scope.eq.workspace`)
        .order('pinned', { ascending: false })
        .order('created_at', { ascending: false }),
      supabase
        .from('materials')
        .select('*')
        .eq('group_id', id)
        .order('created_at', { ascending: false }),
      supabase
        .from('schedule_events')
        .select('*')
        .eq('group_id', id)
        .order('starts_at', { ascending: true }),
      supabase.from('group_members').select('*').eq('group_id', id),
    ])
    setErr(p.error?.message ?? m.error?.message ?? e.error?.message ?? mem.error?.message ?? null)
    setPosts((p.data as Post[]) ?? [])
    setMaterials((m.data as Material[]) ?? [])
    setEvents((e.data as ScheduleEvent[]) ?? [])
    setMembers((mem.data as GroupMember[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    void reload()
  }, [id, session?.user?.id])

  useEffect(() => {
    if (!isGroupOwner) {
      setPostForm((f) => (f.scope === 'workspace' ? { ...f, scope: 'group' } : f))
    }
  }, [isGroupOwner])

  useEffect(() => {
    if (!group) return
    setMetaForm({
      study_level: group.study_level ?? 'licence',
      academic_year: group.academic_year ?? '',
      cohort_official_code: group.cohort_official_code ?? '',
      cohort_suffix: group.cohort_suffix ?? '',
      cohort_sequence: group.cohort_sequence != null ? String(group.cohort_sequence) : '',
      accent_color:
        group.accent_color && /^#[0-9A-Fa-f]{6}$/.test(group.accent_color)
          ? group.accent_color
          : DEFAULT_GROUP_ACCENT,
    })
  }, [group])

  async function suggestMetaOfficialCode() {
    if (!groupOwnerWorkspaceId || !id) return
    setMetaSuggesting(true)
    setErr(null)
    const year = metaForm.academic_year.trim()
    const level = metaForm.study_level
    let q = supabase
      .from('groups')
      .select('cohort_sequence')
      .eq('workspace_id', groupOwnerWorkspaceId)
      .eq('study_level', level)
      .neq('id', id)
    if (year) q = q.eq('academic_year', year)
    else q = q.is('academic_year', null)
    const { data, error } = await q
    setMetaSuggesting(false)
    if (error) {
      setErr(error.message)
      return
    }
    const seqs = ((data ?? []) as { cohort_sequence: number | null }[])
      .map((r) => r.cohort_sequence)
      .filter((n): n is number => typeof n === 'number' && n > 0)
    const next = (seqs.length ? Math.max(...seqs) : 0) + 1
    const code = buildSuggestedCohortCode(level, year || '????', next, metaForm.cohort_suffix || undefined)
    setMetaForm((f) => ({ ...f, cohort_official_code: code, cohort_sequence: String(next) }))
  }

  async function saveGroupMeta(e: React.FormEvent) {
    e.preventDefault()
    if (!id || !group) return
    setMetaSaving(true)
    setErr(null)
    const seqStr = metaForm.cohort_sequence.trim()
    const parsed = seqStr === '' ? null : parseInt(seqStr, 10)
    const accent = metaForm.accent_color.trim()
    const { error } = await supabase
      .from('groups')
      .update({
        study_level: metaForm.study_level,
        academic_year: metaForm.academic_year.trim() || null,
        cohort_official_code: metaForm.cohort_official_code.trim() || null,
        cohort_suffix: metaForm.cohort_suffix.trim() || null,
        cohort_sequence: parsed !== null && Number.isFinite(parsed) ? parsed : null,
        accent_color: /^#[0-9A-Fa-f]{6}$/.test(accent) ? accent : DEFAULT_GROUP_ACCENT,
      })
      .eq('id', id)
    setMetaSaving(false)
    if (error) setErr(error.message)
    else await reload()
  }

  async function submitPost(e: React.FormEvent) {
    e.preventDefault()
    if (!groupOwnerWorkspaceId || !myWorkspaceId || !session?.user?.id || !id) return
    setErr(null)
    const wsForPost = postForm.scope === 'workspace' ? myWorkspaceId : groupOwnerWorkspaceId
    const row = {
      workspace_id: wsForPost,
      group_id: postForm.scope === 'group' ? id : null,
      author_id: session.user.id,
      scope: postForm.scope,
      title: postForm.title.trim() || null,
      content: postForm.content.trim(),
      post_type: 'general',
    }
    const { error } = await supabase.from('posts').insert(row)
    if (error) {
      setErr(error.message)
      return
    }
    setPostForm({ scope: 'group', title: '', content: '' })
    await reload()
  }

  async function uploadMaterial(e: React.FormEvent) {
    e.preventDefault()
    if (!groupOwnerWorkspaceId || !session?.user?.id || !id || !matFile) {
      setErr('اختر ملفاً')
      return
    }
    setErr(null)
    const safeName = matFile.name.replace(/[^\w.\u0600-\u06FF-]+/g, '_')
    const path = `${groupOwnerWorkspaceId}/${id}/${crypto.randomUUID()}-${safeName}`
    const { error: upErr } = await supabase.storage.from('materials').upload(path, matFile)
    if (upErr) {
      setErr(upErr.message)
      return
    }
    const { error } = await supabase.from('materials').insert({
      workspace_id: groupOwnerWorkspaceId,
      group_id: id,
      created_by: session.user.id,
      material_type: 'lesson',
      title: matTitle.trim() || matFile.name,
      file_path: path,
    })
    if (error) {
      setErr(error.message)
      return
    }
    setMatTitle('')
    setMatFile(null)
    await reload()
  }

  async function submitSchedule(e: React.FormEvent) {
    e.preventDefault()
    if (!groupOwnerWorkspaceId || !session?.user?.id || !id) return
    if (!sched.schedule_date || !sched.start_time || !sched.end_time) {
      setErr('حدد اليوم ووقت البداية والنهاية')
      return
    }
    const starts = new Date(`${sched.schedule_date}T${sched.start_time}:00`)
    const ends = new Date(`${sched.schedule_date}T${sched.end_time}:00`)
    if (!(ends.getTime() > starts.getTime())) {
      setErr('وقت النهاية يجب أن يكون بعد وقت البداية في نفس اليوم')
      return
    }
    setErr(null)
    const { error } = await supabase.from('schedule_events').insert({
      workspace_id: groupOwnerWorkspaceId,
      group_id: id,
      created_by: session.user.id,
      event_type: sched.event_type,
      mode: sched.mode,
      subject_name: sched.subject_name.trim() || null,
      starts_at: starts.toISOString(),
      ends_at: ends.toISOString(),
      location: sched.location.trim() || null,
      meeting_link: sched.meeting_link.trim() || null,
      note: sched.note.trim() || null,
    })
    if (error) {
      setErr(error.message)
      return
    }
    setSched({ ...emptySchedForm })
    await reload()
  }

  const canManageSchedule = isGroupOwner || isLinkedStaff

  useEffect(() => {
    if (loading || events.length === 0) return
    const raw = searchParams.get('event')
    if (!raw) return

    const exists = events.some((e) => e.id === raw)
    if (!exists) {
      setSearchParams(
        (prev) => {
          const n = new URLSearchParams(prev)
          n.delete('event')
          return n
        },
        { replace: true },
      )
      return
    }

    setHighlightEventId(raw)
    requestAnimationFrame(() => {
      document.getElementById(`schedule-event-${raw}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
    window.setTimeout(() => setHighlightEventId(null), 4500)

    setSearchParams(
      (prev) => {
        const n = new URLSearchParams(prev)
        n.delete('event')
        return n
      },
      { replace: true },
    )
  }, [loading, events, searchParams, setSearchParams])

  function startEditSchedule(ev: ScheduleEvent) {
    const { schedule_date, start_time, end_time } = scheduleFieldsFromIso(ev.starts_at, ev.ends_at)
    setEditingEventId(ev.id)
    setEditSched({
      event_type: ev.event_type === 'seminar' ? 'seminar' : 'class',
      subject_name: ev.subject_name ?? '',
      mode: ev.mode,
      schedule_date,
      start_time,
      end_time,
      location: ev.location ?? '',
      meeting_link: ev.meeting_link ?? '',
      note: ev.note ?? '',
    })
  }

  function cancelEditSchedule() {
    setEditingEventId(null)
    setEditSched(null)
  }

  async function saveEditSchedule(e: React.FormEvent) {
    e.preventDefault()
    if (!editingEventId || !editSched) return
    if (!editSched.schedule_date || !editSched.start_time || !editSched.end_time) {
      setErr('حدد اليوم ووقت البداية والنهاية')
      return
    }
    const starts = new Date(`${editSched.schedule_date}T${editSched.start_time}:00`)
    const ends = new Date(`${editSched.schedule_date}T${editSched.end_time}:00`)
    if (!(ends.getTime() > starts.getTime())) {
      setErr('وقت النهاية يجب أن يكون بعد وقت البداية في نفس اليوم')
      return
    }
    setScheduleEditSaving(true)
    setErr(null)
    const { error } = await supabase
      .from('schedule_events')
      .update({
        event_type: editSched.event_type,
        mode: editSched.mode,
        subject_name: editSched.subject_name.trim() || null,
        starts_at: starts.toISOString(),
        ends_at: ends.toISOString(),
        location: editSched.location.trim() || null,
        meeting_link: editSched.meeting_link.trim() || null,
        note: editSched.note.trim() || null,
      })
      .eq('id', editingEventId)
    setScheduleEditSaving(false)
    if (error) {
      setErr(error.message)
      return
    }
    cancelEditSchedule()
    await reload()
  }

  async function deleteScheduleEvent(evId: string) {
    if (!window.confirm('حذف هذه الحصة من الجدول؟')) return
    setErr(null)
    const { error } = await supabase.from('schedule_events').delete().eq('id', evId)
    if (error) {
      setErr(error.message)
      return
    }
    if (editingEventId === evId) cancelEditSchedule()
    await reload()
  }

  async function promote(m: GroupMember, role: 'coordinator' | 'student') {
    if (!id) return
    setErr(null)
    const { error } = await supabase.rpc('set_group_member_role', {
      p_group_id: id,
      p_user_id: m.user_id,
      p_role: role,
    })
    if (error) setErr(error.message)
    else await reload()
  }

  async function rotateTeacherLink() {
    if (!id || !isGroupOwner) return
    setRotatingLink(true)
    setErr(null)
    const { data, error } = await supabase.rpc('rotate_teacher_link_secret', { p_group_id: id })
    setRotatingLink(false)
    if (error) setErr(error.message)
    else if (typeof data === 'string') setTeacherLinkSecret(data)
  }

  function shareScheduleWhatsapp() {
    if (!group) return
    const lines = events
      .slice(0, 12)
      .map((ev) => {
        const kind = ev.event_type === 'seminar' ? 'ندوة' : 'حصة'
        return `${new Date(ev.starts_at).toLocaleString('ar-MA')} — ${ev.subject_name ?? kind} (${kind}، ${ev.mode === 'online' ? 'عن بُعد' : 'حضوري'})`
      })
    const link = joinUrlStudent || `${typeof window !== 'undefined' ? window.location.origin : ''}/s/join?code=${group.join_code}`
    const text = `جدول ${group.group_name}:\n${lines.join('\n')}\n\nرابط المنصة: ${link}`
    shareWhatsAppMessage(text)
  }

  if (loading || !group) {
    return loading ? <Loading /> : <EmptyState title="فوج غير موجود" />
  }

  const scheduleFormAccent =
    metaForm.accent_color.trim() && /^#[0-9A-Fa-f]{6}$/.test(metaForm.accent_color.trim())
      ? metaForm.accent_color.trim()
      : DEFAULT_GROUP_ACCENT
  const scheduleFormFg = pickContrastingForeground(scheduleFormAccent)

  return (
    <div className="page">
      <p className="breadcrumb">
        <Link to="/t/groups">الأفواج</Link> / {group.group_name}
      </p>
      <h1>{group.group_name}</h1>
      <ErrorBanner message={err} />

      {isGroupOwner ? (
      <section className="section">
        <h2>بيانات الفوج الرسمية</h2>
        <p className="muted small">
          المستوى والرمز الرسمي (مثل الرمز الذي يعطيه منسق الفوج) يربط المحتوى والجدول بهذا الفوج دون
          الخلط مع أفواج أخرى.
        </p>
        <form className="form form--grid" onSubmit={saveGroupMeta}>
          <label className="teacher-groups__color-field">
            لون الفوج (في قائمة الأفواج)
            <input
              type="color"
              value={metaForm.accent_color}
              onChange={(e) => setMetaForm({ ...metaForm, accent_color: e.target.value })}
              aria-label="لون تمييز الفوج"
            />
          </label>
          <label>
            المستوى الدراسي
            <select
              value={metaForm.study_level}
              onChange={(e) => setMetaForm({ ...metaForm, study_level: e.target.value as StudyLevel })}
            >
              <option value="licence">إجازة</option>
              <option value="master">ماستر</option>
              <option value="doctorate">دكتوراه</option>
            </select>
          </label>
          <label>
            السنة الدراسية
            <input
              value={metaForm.academic_year}
              onChange={(e) => setMetaForm({ ...metaForm, academic_year: e.target.value })}
            />
          </label>
          <label>
            لاحقة الرمز (اختياري)
            <input
              value={metaForm.cohort_suffix}
              onChange={(e) => setMetaForm({ ...metaForm, cohort_suffix: e.target.value })}
            />
          </label>
          <label>
            تسلسل (اختياري)
            <input
              value={metaForm.cohort_sequence}
              onChange={(e) => setMetaForm({ ...metaForm, cohort_sequence: e.target.value })}
              inputMode="numeric"
            />
          </label>
          <label className="teacher-groups__code-field">
            الرمز الرسمي
            <div className="teacher-groups__code-row">
              <input
                value={metaForm.cohort_official_code}
                onChange={(e) => setMetaForm({ ...metaForm, cohort_official_code: e.target.value })}
                dir="ltr"
                className="input--ltr"
              />
              <button
                type="button"
                className="btn btn--secondary"
                disabled={metaSuggesting}
                onClick={() => void suggestMetaOfficialCode()}
              >
                {metaSuggesting ? '…' : 'اقتراح'}
              </button>
            </div>
          </label>
          <button type="submit" className="btn btn--primary" disabled={metaSaving}>
            {metaSaving ? 'جاري الحفظ…' : 'حفظ بيانات الفوج'}
          </button>
        </form>
      </section>
      ) : (
        <p className="muted small" style={{ marginBottom: '1.25rem' }}>
          أنت مرتبط بهذا الفوج كأستاذ مساعد؛ تعديل البيانات الرسمية متاح لمنشئ الفوج فقط.
        </p>
      )}

      <section className="section">
        <h2>دعوة الطلبة</h2>
        <p>
          <strong>كود الانضمام القصير:</strong> {group.join_code}
        </p>
        {joinUrlStudent ? (
          <>
            <p className="muted small">رابط وQR آمن للانضمام (يُفضّل للطلبة):</p>
            <p className="muted wrap" dir="ltr">
              {joinUrlStudent}
            </p>
            {qrDataUrl ? (
              <p className="teacher-group__qr">
                <img src={qrDataUrl} alt="QR انضمام الطلبة" width={200} height={200} />
              </p>
            ) : null}
          </>
        ) : (
          <p className="muted wrap">
            {typeof window !== 'undefined' ? `${window.location.origin}/s/join?code=${group.join_code}` : ''}
          </p>
        )}
        {isGroupOwner && teacherLinkSecret ? (
          <div className="teacher-group__teacher-link">
            <p className="muted small">
              <strong>رمز ربط أستاذ آخر</strong> (لا يشارك مع الطلبة): انسخه لزميل يدرّس نفس الفوج.
            </p>
            <p className="mono wrap" dir="ltr">
              {teacherLinkSecret}
            </p>
            <button
              type="button"
              className="btn btn--ghost"
              disabled={rotatingLink}
              onClick={() => void rotateTeacherLink()}
            >
              {rotatingLink ? '…' : 'توليد رمز جديد'}
            </button>
          </div>
        ) : null}
        <p>
          <Link to={`/t/groups/${id}/staff`} className="btn btn--secondary">
            محادثة طاقم التدريس
          </Link>
        </p>
        <button
          type="button"
          className="btn btn--secondary"
          onClick={() =>
            shareWhatsAppMessage(
              `انضم إلى فوج ${group.group_name} على Ostadi:\n${joinUrlStudent || `${typeof window !== 'undefined' ? window.location.origin : ''}/s/join?code=${group.join_code}`}\nالكود: ${group.join_code}`,
            )
          }
        >
          مشاركة واتساب
        </button>
      </section>

      <section className="section">
        <h2>نشر على الحائط</h2>
        <form className="form" onSubmit={submitPost}>
          <label>
            النطاق
            <select
              value={postForm.scope}
              onChange={(e) =>
                setPostForm({
                  ...postForm,
                  scope: e.target.value === 'workspace' ? 'workspace' : 'group',
                })
              }
            >
              <option value="group">هذا الفوج فقط</option>
              <option value="workspace" disabled={!isGroupOwner}>
                كل أفواجي{!isGroupOwner ? ' (منشئ الفوج فقط)' : ''}
              </option>
            </select>
          </label>
          <label>
            العنوان (اختياري)
            <input
              value={postForm.title}
              onChange={(e) => setPostForm({ ...postForm, title: e.target.value })}
            />
          </label>
          <label>
            المحتوى
            <textarea
              rows={4}
              value={postForm.content}
              onChange={(e) => setPostForm({ ...postForm, content: e.target.value })}
              required
            />
          </label>
          <button type="submit" className="btn btn--primary">
            نشر
          </button>
        </form>
        <h3>آخر المنشورات</h3>
        {posts.length === 0 ? (
          <EmptyState title="لا منشورات بعد" />
        ) : (
          <ul className="post-list">
            {posts.map((p) => (
              <li key={p.id} className="post-card">
                {p.pinned ? <span className="pill">مثبت</span> : null}
                <span className="pill">{p.scope === 'workspace' ? 'عام' : 'الفوج'}</span>
                {p.title ? <h4>{p.title}</h4> : null}
                <p>{p.content}</p>
                <time className="muted">{new Date(p.created_at).toLocaleString('ar-MA')}</time>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="section">
        <h2>المواد والملفات</h2>
        <form className="form" onSubmit={uploadMaterial}>
          <label>
            عنوان الملف
            <input value={matTitle} onChange={(e) => setMatTitle(e.target.value)} />
          </label>
          <label>
            ملف
            <input type="file" onChange={(e) => setMatFile(e.target.files?.[0] ?? null)} />
          </label>
          <button type="submit" className="btn btn--primary">
            رفع
          </button>
        </form>
        {materials.length === 0 ? (
          <EmptyState title="لا ملفات بعد" />
        ) : (
          <ul>
            {materials.map((m) => (
              <li key={m.id}>
                {m.title} {m.file_path ? <span className="muted">(مخزن)</span> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="section" id="group-schedule">
        <h2>الجدول</h2>
        <form className="form form--grid form--schedule-slot" onSubmit={submitSchedule}>
          <label>
            نوع الحدث
            <select
              value={sched.event_type}
              disabled={!canManageSchedule}
              onChange={(e) =>
                setSched({
                  ...sched,
                  event_type: e.target.value === 'seminar' ? 'seminar' : 'class',
                })
              }
            >
              <option value="class">حصة</option>
              <option value="seminar">ندوة</option>
            </select>
          </label>
          <label>
            المادة / عنوان الندوة
            <input
              value={sched.subject_name}
              disabled={!canManageSchedule}
              onChange={(e) => setSched({ ...sched, subject_name: e.target.value })}
            />
          </label>
          <label>
            النمط
            <select
              value={sched.mode}
              disabled={!canManageSchedule}
              onChange={(e) =>
                setSched({
                  ...sched,
                  mode: e.target.value === 'online' ? 'online' : 'on_site',
                })
              }
            >
              <option value="on_site">حضوري</option>
              <option value="online">عن بُعد</option>
            </select>
          </label>
          <label className="span-2">
            اليوم
            <input
              type="date"
              className="input--ltr"
              value={sched.schedule_date}
              disabled={!canManageSchedule}
              onChange={(e) => setSched({ ...sched, schedule_date: e.target.value })}
            />
          </label>
          <label>
            وقت البداية
            <input
              type="time"
              className="input--ltr"
              value={sched.start_time}
              disabled={!canManageSchedule}
              onChange={(e) =>
                setSched((s) => ({
                  ...s,
                  start_time: e.target.value,
                  end_time: nextEndAfterStartChange(s.start_time, s.end_time, e.target.value),
                }))
              }
            />
          </label>
          <label>
            وقت النهاية
            <input
              type="time"
              className="input--ltr"
              value={sched.end_time}
              disabled={!canManageSchedule}
              onChange={(e) => setSched({ ...sched, end_time: e.target.value })}
            />
          </label>
          <label>
            قاعة
            <input
              value={sched.location}
              disabled={!canManageSchedule}
              onChange={(e) => setSched({ ...sched, location: e.target.value })}
            />
          </label>
          <label>
            رابط الاجتماع
            <input
              value={sched.meeting_link}
              disabled={!canManageSchedule}
              onChange={(e) => setSched({ ...sched, meeting_link: e.target.value })}
            />
          </label>
          <label className="span-2">
            ملاحظة
            <input
              value={sched.note}
              disabled={!canManageSchedule}
              onChange={(e) => setSched({ ...sched, note: e.target.value })}
            />
          </label>
          <button
            type="submit"
            className="btn btn--primary schedule-add-submit"
            disabled={!canManageSchedule}
            style={{
              background: scheduleFormAccent,
              color: scheduleFormFg,
              border: 'none',
            }}
          >
            {sched.event_type === 'seminar' ? 'إضافة ندوة' : 'إضافة حصة'}
          </button>
        </form>
        <button type="button" className="btn btn--secondary" onClick={shareScheduleWhatsapp}>
          مشاركة الجدول بواتساب
        </button>
        {events.length === 0 ? (
          <EmptyState title="لا أحداث في الجدول" />
        ) : (
          <ul className="schedule-list">
            {events.map((ev) => (
              <li
                key={ev.id}
                id={`schedule-event-${ev.id}`}
                className={`schedule-list__item${highlightEventId === ev.id ? ' schedule-list__item--focused' : ''}`}
              >
                <div>
                  {ev.event_type === 'seminar' ? (
                    <span className="pill pill--seminar">ندوة</span>
                  ) : (
                    <span className="pill">حصة</span>
                  )}{' '}
                  <strong>{ev.subject_name ?? (ev.event_type === 'seminar' ? 'ندوة' : 'حصة')}</strong> —{' '}
                  {new Date(ev.starts_at).toLocaleString('ar-MA')} →{' '}
                  {new Date(ev.ends_at).toLocaleString('ar-MA')} ({ev.mode === 'online' ? 'عن بُعد' : 'حضوري'})
                  {ev.location ? <span className="muted"> — {ev.location}</span> : null}
                </div>
                {canManageSchedule ? (
                  <div className="schedule-list__actions">
                    <button
                      type="button"
                      className="btn btn--ghost"
                      onClick={() =>
                        editingEventId === ev.id ? cancelEditSchedule() : startEditSchedule(ev)
                      }
                    >
                      {editingEventId === ev.id ? 'إلغاء التعديل' : 'تعديل / إعادة جدولة'}
                    </button>
                    <button
                      type="button"
                      className="btn btn--ghost"
                      onClick={() => void deleteScheduleEvent(ev.id)}
                    >
                      حذف
                    </button>
                  </div>
                ) : null}
                {editingEventId === ev.id && editSched ? (
                  <form className="form form--grid schedule-list__edit-form" onSubmit={saveEditSchedule}>
                    <label>
                      نوع الحدث
                      <select
                        value={editSched.event_type}
                        disabled={scheduleEditSaving}
                        onChange={(e) =>
                          setEditSched({
                            ...editSched,
                            event_type: e.target.value === 'seminar' ? 'seminar' : 'class',
                          })
                        }
                      >
                        <option value="class">حصة</option>
                        <option value="seminar">ندوة</option>
                      </select>
                    </label>
                    <label>
                      المادة / عنوان الندوة
                      <input
                        value={editSched.subject_name}
                        disabled={scheduleEditSaving}
                        onChange={(e) => setEditSched({ ...editSched, subject_name: e.target.value })}
                      />
                    </label>
                    <label>
                      النمط
                      <select
                        value={editSched.mode}
                        disabled={scheduleEditSaving}
                        onChange={(e) =>
                          setEditSched({
                            ...editSched,
                            mode: e.target.value === 'online' ? 'online' : 'on_site',
                          })
                        }
                      >
                        <option value="on_site">حضوري</option>
                        <option value="online">عن بُعد</option>
                      </select>
                    </label>
                    <label className="span-2">
                      اليوم
                      <input
                        type="date"
                        className="input--ltr"
                        value={editSched.schedule_date}
                        disabled={scheduleEditSaving}
                        onChange={(e) => setEditSched({ ...editSched, schedule_date: e.target.value })}
                      />
                    </label>
                    <label>
                      وقت البداية
                      <input
                        type="time"
                        className="input--ltr"
                        value={editSched.start_time}
                        disabled={scheduleEditSaving}
                        onChange={(e) =>
                          setEditSched((s) =>
                            s
                              ? {
                                  ...s,
                                  start_time: e.target.value,
                                  end_time: nextEndAfterStartChange(s.start_time, s.end_time, e.target.value),
                                }
                              : s,
                          )
                        }
                      />
                    </label>
                    <label>
                      وقت النهاية
                      <input
                        type="time"
                        className="input--ltr"
                        value={editSched.end_time}
                        disabled={scheduleEditSaving}
                        onChange={(e) => setEditSched({ ...editSched, end_time: e.target.value })}
                      />
                    </label>
                    <label>
                      قاعة
                      <input
                        value={editSched.location}
                        disabled={scheduleEditSaving}
                        onChange={(e) => setEditSched({ ...editSched, location: e.target.value })}
                      />
                    </label>
                    <label>
                      رابط الاجتماع
                      <input
                        value={editSched.meeting_link}
                        disabled={scheduleEditSaving}
                        onChange={(e) => setEditSched({ ...editSched, meeting_link: e.target.value })}
                      />
                    </label>
                    <label className="span-2">
                      ملاحظة
                      <input
                        value={editSched.note}
                        disabled={scheduleEditSaving}
                        onChange={(e) => setEditSched({ ...editSched, note: e.target.value })}
                      />
                    </label>
                    <button type="submit" className="btn btn--primary" disabled={scheduleEditSaving}>
                      {scheduleEditSaving ? 'جاري الحفظ…' : 'حفظ التعديلات'}
                    </button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="section">
        <h2>الطلبة والمنسق</h2>
        <ul className="member-list">
          {members.map((m) => (
            <li key={m.id} className={m.role_in_group === 'coordinator' ? 'member--coord' : ''}>
              <span>
                {m.display_name ?? m.user_id}
                {m.role_in_group === 'teacher' ? (
                  <span className="pill">أستاذ</span>
                ) : m.role_in_group === 'coordinator' ? (
                  <span className="pill pill--coord">منسق</span>
                ) : (
                  <span className="pill pill--student">طالب</span>
                )}
              </span>
              {m.role_in_group === 'student' ? (
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => void promote(m, 'coordinator')}
                >
                  جعله منسقاً
                </button>
              ) : null}
              {m.role_in_group === 'coordinator' ? (
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => void promote(m, 'student')}
                >
                  إلغاء المنسق
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
