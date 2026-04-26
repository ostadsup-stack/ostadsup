import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { loadTeacherAppAdminInboxLine, type TeacherAppAdminInboxLine } from '../../lib/teacherAppAdminChatInbox'
import { fetchWorkspaceForTeacher } from '../../lib/workspace'
import { cohortListLinkAccentStyle, normalizeGroupAccent } from '../../lib/groupTheme'
import { studyLevelLabelAr } from '../../lib/teacherGroups'
import { Loading } from '../../components/Loading'
import { ErrorBanner } from '../../components/ErrorBanner'

type TeacherInboxRow = {
  conversation_id: string
  conversation_type: string
  group_id: string
  workspace_id: string
  subject: string | null
  conversation_created_at: string
  unread_count: number
  last_message_at: string | null
  last_sender_name: string | null
  last_sender_role: string | null
  last_message_kind: string | null
  last_incoming_message_kind: string | null
  group_name: string | null
  study_level: string | null
  accent_color: string | null
  coordinator_names: string | null
  has_admin_message: boolean
  last_teacher_peer_name: string | null
}

const URGENT_KINDS = new Set(['urgent', 'complaint'])

function isUrgentIncoming(kind: string | null | undefined) {
  return kind != null && URGENT_KINDS.has(kind)
}

function bucketRows(rows: TeacherInboxRow[]) {
  const staff = rows.filter((r) => r.conversation_type === 'teacher_staff')
  const admin = rows.filter((r) => r.has_admin_message && r.conversation_type !== 'teacher_staff')
  const coordinator = rows.filter(
    (r) => r.conversation_type === 'teacher_coordinator' && !r.has_admin_message,
  )
  const students = rows.filter((r) => r.conversation_type === 'teacher_student' && !r.has_admin_message)
  const placed = new Set(
    [...staff, ...admin, ...coordinator, ...students].map((r) => r.conversation_id),
  )
  const other = rows.filter((r) => !placed.has(r.conversation_id))
  const sortByActivity = (a: TeacherInboxRow, b: TeacherInboxRow) => {
    const ta = a.last_message_at ?? a.conversation_created_at
    const tb = b.last_message_at ?? b.conversation_created_at
    return new Date(tb).getTime() - new Date(ta).getTime()
  }
  staff.sort(sortByActivity)
  admin.sort(sortByActivity)
  coordinator.sort(sortByActivity)
  students.sort(sortByActivity)
  other.sort(sortByActivity)
  return { staff, admin, coordinator, students, other }
}

function InboxSection({
  id,
  title,
  emptyHint,
  children,
}: {
  id: string
  title: string
  emptyHint: string
  children: React.ReactNode
}) {
  return (
    <section className="teacher-inbox__section" aria-labelledby={id}>
      <h2 id={id} className="teacher-inbox__section-title">
        {title}
      </h2>
      {children ? (
        children
      ) : (
        <p className="muted small teacher-inbox__section-empty">{emptyHint}</p>
      )}
    </section>
  )
}

function rowAccentStyle(accent: string | null | undefined) {
  return cohortListLinkAccentStyle(normalizeGroupAccent(accent))
}

function trimPreview(s: string, max = 100) {
  const t = s.replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  return `${t.slice(0, max)}…`
}

export function TeacherInbox() {
  const { session, profile } = useAuth()
  const [err, setErr] = useState<string | null>(null)
  const [rows, setRows] = useState<TeacherInboxRow[]>([])
  const [loading, setLoading] = useState(true)
  const [appAdminLine, setAppAdminLine] = useState<TeacherAppAdminInboxLine | null>(null)
  const [appAdminLoading, setAppAdminLoading] = useState(false)
  const isTeacherOnly = profile?.role === 'teacher'

  useEffect(() => {
    let ok = true
    ;(async () => {
      if (!session?.user?.id) {
        setRows([])
        setLoading(false)
        return
      }
      const { workspace } = await fetchWorkspaceForTeacher(session.user.id)
      const { data, error: rpcErr } = await supabase.rpc('teacher_inbox_list', {
        p_workspace_id: workspace?.id ?? null,
      })
      if (!ok) return
      if (rpcErr) {
        setErr(rpcErr.message)
        setRows([])
        setLoading(false)
        return
      }
      const list = (data as TeacherInboxRow[]) ?? []
      setErr(null)
      setRows(list)
      setLoading(false)
    })()
    return () => {
      ok = false
    }
  }, [session?.user?.id])

  const reloadAppAdminLine = useCallback(async () => {
    if (!isTeacherOnly) {
      setAppAdminLine(null)
      return
    }
    setAppAdminLoading(true)
    const { line, error: appErr } = await loadTeacherAppAdminInboxLine()
    setAppAdminLoading(false)
    if (appErr) setAppAdminLine(null)
    else setAppAdminLine(line)
  }, [isTeacherOnly])

  useEffect(() => {
    if (!isTeacherOnly || !session?.user?.id) {
      setAppAdminLine(null)
      return
    }
    void reloadAppAdminLine()
  }, [isTeacherOnly, session?.user?.id, reloadAppAdminLine, rows.length])

  useEffect(() => {
    if (!isTeacherOnly) return
    const id = window.setInterval(() => void reloadAppAdminLine(), 30_000)
    return () => window.clearInterval(id)
  }, [isTeacherOnly, reloadAppAdminLine])

  const { staff, admin, coordinator, students, other } = useMemo(() => bucketRows(rows), [rows])

  if (loading) return <Loading />

  return (
    <div className="page">
      <h1>صندوق المحادثات</h1>
      <ErrorBanner message={err} />

      {rows.length === 0 && !err ? (
        <p className="muted">لا محادثات بعد. عند وصول الرسائل ستُصنَّف هنا.</p>
      ) : null}

      <InboxSection
        id="teacher-inbox-staff"
        title="طاقم التدريس"
        emptyHint="لا محادثات طاقم بعد."
      >
        {staff.length > 0 ? (
          <ul className="list-links teacher-inbox__list">
            {staff.map((r) => {
              const accent = rowAccentStyle(r.accent_color)
              const peerTeacher = r.last_teacher_peer_name?.trim() || r.last_sender_name || '—'
              return (
                <li key={r.conversation_id}>
                  <Link
                    to={`/t/inbox/${r.conversation_id}`}
                    className="list-links__link--cohort teacher-inbox__row"
                    style={accent}
                  >
                    <span className="teacher-inbox__row-main">
                      <span className="teacher-inbox__row-title">{r.subject ?? 'طاقم التدريس'}</span>
                      {r.group_name ? (
                        <span className="muted small teacher-inbox__row-meta">«{r.group_name}»</span>
                      ) : null}
                    </span>
                    <span className="teacher-inbox__row-sub muted small">
                      آخر أستاذ مرسل: <strong>{peerTeacher}</strong>
                    </span>
                    {r.unread_count > 0 ? (
                      <span className="teacher-inbox__unread-badge" title="غير مقروء">
                        {r.unread_count > 99 ? '99+' : r.unread_count}
                      </span>
                    ) : null}
                  </Link>
                </li>
              )
            })}
          </ul>
        ) : null}
      </InboxSection>

      <section className="teacher-inbox__section" aria-labelledby="teacher-inbox-admin">
        <div className="teacher-inbox__section-head">
          <h2 id="teacher-inbox-admin" className="teacher-inbox__section-title">
            مدير التطبيق
          </h2>
          <Link to="/t/inbox/admin" className="btn btn--small btn--primary">
            إرسال رسالة
          </Link>
        </div>
        {(isTeacherOnly && (appAdminLoading || appAdminLine)) || admin.length > 0 ? (
          <ul className="list-links teacher-inbox__list">
            {appAdminLoading && !appAdminLine ? (
              <li>
                <span className="teacher-inbox__row teacher-inbox__row--app-admin muted">جاري تحميل…</span>
              </li>
            ) : appAdminLine ? (
              <li key="app-admin-direct">
                <Link
                  to="/t/inbox/admin"
                  className="teacher-inbox__row teacher-inbox__row--app-admin teacher-inbox__row--admin"
                >
                  <span className="teacher-inbox__row-main">
                    <span className="teacher-inbox__row-title">مدير التطبيق (محادثة مباشرة)</span>
                    <span className="muted small teacher-inbox__row-meta">مع فريق الإدارة</span>
                  </span>
                  {appAdminLine.lastBody && appAdminLine.lastAt ? (
                    <span className="teacher-inbox__row-sub muted small">
                      {appAdminLine.lastFromAppAdmin ? (
                        <span className="me-1 font-medium text-slate-600 dark:text-slate-300">المدير:</span>
                      ) : (
                        <span className="me-1">آخرك:</span>
                      )}
                      {trimPreview(appAdminLine.lastBody)}{' '}
                      <time
                        className="tabular-nums"
                        dateTime={appAdminLine.lastAt}
                        title={appAdminLine.lastAt}
                      >
                        {new Date(appAdminLine.lastAt).toLocaleString('ar-MA', { dateStyle: 'short', timeStyle: 'short' })}
                      </time>
                    </span>
                  ) : (
                    <span className="teacher-inbox__row-sub muted small">لا توجد رسائل بعد — اضغط لفتح المحادثة</span>
                  )}
                  {appAdminLine.hasUnreadFromAdmin ? (
                    <span className="teacher-inbox__unread-badge" title="جديد من المدير" aria-label="جديد">
                      1
                    </span>
                  ) : null}
                </Link>
              </li>
            ) : null}
            {admin.map((r) => (
              <li key={r.conversation_id}>
                <Link
                  to={`/t/inbox/${r.conversation_id}`}
                  className={
                    r.group_id
                      ? 'list-links__link--cohort teacher-inbox__row teacher-inbox__row--admin'
                      : 'teacher-inbox__row teacher-inbox__row--admin'
                  }
                  style={r.group_id ? rowAccentStyle(r.accent_color) : undefined}
                >
                  <span className="teacher-inbox__row-main">
                    <span className="teacher-inbox__row-title">{r.subject ?? 'رسالة إدارية'}</span>
                    {r.group_name ? (
                      <span className="muted small teacher-inbox__row-meta">«{r.group_name}»</span>
                    ) : null}
                  </span>
                  {r.unread_count > 0 ? (
                    <span className="teacher-inbox__unread-badge" title="غير مقروء">
                      {r.unread_count > 99 ? '99+' : r.unread_count}
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
        {isTeacherOnly
          ? !appAdminLine &&
            !appAdminLoading &&
            admin.length === 0 && (
            <p className="muted small teacher-inbox__section-empty">
              يمكنك مراسلة المدير من الزر «إرسال رسالة» أعلاه. تظهر محادثتك وآخر الرد هنا.
            </p>
          )
          : admin.length === 0 && (
            <p className="muted small teacher-inbox__section-empty">
              لا رسائل من المدير ضمن المحادثات. يمكنك مراسلة المدير من الزر أعلاه.
            </p>
          )}
      </section>

      <InboxSection
        id="teacher-inbox-coord"
        title="المنسقون"
        emptyHint="لا محادثات مع منسقين."
      >
        {coordinator.length > 0 ? (
          <ul className="list-links teacher-inbox__list">
            {coordinator.map((r) => {
              const urgent = isUrgentIncoming(r.last_incoming_message_kind)
              return (
                <li key={r.conversation_id}>
                  <Link
                    to={`/t/inbox/${r.conversation_id}`}
                    className="list-links__link--cohort teacher-inbox__row teacher-inbox__row--coordinator"
                    style={rowAccentStyle(r.accent_color)}
                  >
                    <div className="teacher-inbox__coord-grid">
                      <span className="teacher-inbox__row-title">{r.group_name ?? 'فوج'}</span>
                      <span className="muted small">
                        المنسق: <strong>{r.coordinator_names ?? '—'}</strong>
                      </span>
                      <span className="muted small">{studyLevelLabelAr(r.study_level)}</span>
                    </div>
                    <div className="teacher-inbox__row-trail">
                      {urgent ? (
                        <span
                          className="teacher-inbox__urgent"
                          title="رسالة عاجلة"
                          aria-label="رسالة عاجلة"
                        />
                      ) : null}
                      {r.unread_count > 0 ? (
                        <span className="teacher-inbox__unread-badge" title="غير مقروء">
                          {r.unread_count > 99 ? '99+' : r.unread_count}
                        </span>
                      ) : null}
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        ) : null}
      </InboxSection>

      <InboxSection
        id="teacher-inbox-students"
        title="محادثات الطلبة"
        emptyHint="لا محادثات مع طلبة."
      >
        {students.length > 0 ? (
          <ul className="list-links teacher-inbox__list">
            {students.map((r) => (
              <li key={r.conversation_id}>
                <Link
                  to={`/t/inbox/${r.conversation_id}`}
                  className="list-links__link--cohort teacher-inbox__row"
                  style={rowAccentStyle(r.accent_color)}
                >
                  <span className="teacher-inbox__row-main">
                    <span className="teacher-inbox__row-title">{r.subject ?? 'محادثة'}</span>
                    {r.group_name ? (
                      <span className="muted small teacher-inbox__row-meta">«{r.group_name}»</span>
                    ) : null}
                  </span>
                  {r.unread_count > 0 ? (
                    <span className="teacher-inbox__unread-badge" title="غير مقروء">
                      {r.unread_count > 99 ? '99+' : r.unread_count}
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </InboxSection>

      {other.length > 0 ? (
        <InboxSection id="teacher-inbox-other" title="أخرى" emptyHint="">
          <ul className="list-links teacher-inbox__list">
            {other.map((r) => (
              <li key={r.conversation_id}>
                <Link
                  to={`/t/inbox/${r.conversation_id}`}
                  className={
                    r.group_id
                      ? 'list-links__link--cohort teacher-inbox__row'
                      : 'teacher-inbox__row'
                  }
                  style={r.group_id ? rowAccentStyle(r.accent_color) : undefined}
                >
                  <span className="teacher-inbox__row-main">
                    <span className="teacher-inbox__row-title">{r.subject ?? 'محادثة'}</span>
                    <span className="muted small teacher-inbox__row-meta">{r.conversation_type}</span>
                  </span>
                  {r.unread_count > 0 ? (
                    <span className="teacher-inbox__unread-badge" title="غير مقروء">
                      {r.unread_count > 99 ? '99+' : r.unread_count}
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </InboxSection>
      ) : null}
    </div>
  )
}
