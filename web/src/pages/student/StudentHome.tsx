import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import type { Conversation, Post, ScheduleEvent } from '../../types'
import {
  fetchActiveStudentMemberships,
  fetchWorkspaceSlug,
  filterStudentRoleRows,
  type StudentMemberRow,
} from '../../lib/studentGroup'
import { cohortListLinkAccentStyle, cohortPageSurfaceStyle, normalizeGroupAccent } from '../../lib/groupTheme'
import { addDays, sameLocalDay, startOfMonday } from '../../lib/teacherWeekSchedule'
import { scheduleEventCreatorLabel } from '../../lib/scheduleConflict'
import { Loading } from '../../components/Loading'
import { ErrorBanner } from '../../components/ErrorBanner'
import { EmptyState } from '../../components/EmptyState'
import { PageHeader } from '../../components/PageHeader'

export function StudentHome() {
  const { session } = useAuth()
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<StudentMemberRow[]>([])
  const [scheduleEvents, setScheduleEvents] = useState<ScheduleEvent[]>([])
  const [postPreview, setPostPreview] = useState<Post[]>([])
  const [convPreview, setConvPreview] = useState<Conversation[]>([])
  const [publicSlug, setPublicSlug] = useState<string | null>(null)

  const scheduleBounds = useMemo(() => {
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
    const weekMonday = startOfMonday(now)
    const nextWeekStart = addDays(weekMonday, 7)
    const nextWeekEnd = addDays(nextWeekStart, 6)
    nextWeekEnd.setHours(23, 59, 59, 999)
    return { now, todayStart, nextWeekStart, nextWeekEnd, rangeStart: todayStart.toISOString(), rangeEnd: nextWeekEnd.toISOString() }
  }, [])

  useEffect(() => {
    let ok = true
    ;(async () => {
      if (!session?.user?.id) {
        setLoading(false)
        return
      }
      setLoading(true)
      setErr(null)
      const { rows: memberRows, error: mErr } = await fetchActiveStudentMemberships(supabase, session.user.id)
      if (!ok) return
      if (mErr) {
        setErr(mErr)
        setRows([])
        setLoading(false)
        return
      }
      setRows(memberRows)

      const students = filterStudentRoleRows(memberRows)
      const gid =
        students[0]?.group_id ??
        memberRows.find((r) => r.role_in_group === 'coordinator')?.group_id ??
        memberRows[0]?.group_id

      const g0 = memberRows.find((r) => r.group_id === gid)?.groups
      if (!gid || !g0?.workspace_id) {
        setScheduleEvents([])
        setPostPreview([])
        setConvPreview([])
        setPublicSlug(null)
        setLoading(false)
        return
      }

      const ws = g0.workspace_id
      const slug = await fetchWorkspaceSlug(supabase, ws)
      if (!ok) return
      setPublicSlug(slug)

      const [ev, posts, parts] = await Promise.all([
        supabase
          .from('schedule_events')
          .select('*, profiles:profiles!schedule_events_created_by_fkey(full_name)')
          .eq('group_id', gid)
          .gte('starts_at', scheduleBounds.rangeStart)
          .lte('starts_at', scheduleBounds.rangeEnd)
          .order('starts_at', { ascending: true }),
        supabase
          .from('posts')
          .select('*')
          .eq('workspace_id', ws)
          .is('deleted_at', null)
          .or(`group_id.eq.${gid},scope.eq.workspace`)
          .order('pinned', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(5),
        supabase.from('conversation_participants').select('conversation_id').eq('user_id', session.user.id),
      ])

      if (!ok) return
      setErr(ev.error?.message ?? posts.error?.message ?? parts.error?.message ?? null)
      setScheduleEvents((ev.data as ScheduleEvent[]) ?? [])
      setPostPreview((posts.data as Post[]) ?? [])

      const ids = [...new Set((parts.data ?? []).map((p) => p.conversation_id as string))]
      if (ids.length === 0) {
        setConvPreview([])
      } else {
        const { data: convs, error: cErr } = await supabase
          .from('conversations')
          .select('*')
          .in('id', ids)
          .order('created_at', { ascending: false })
          .limit(4)
        if (!ok) return
        if (cErr) setErr((prev) => prev ?? cErr.message)
        setConvPreview((convs as Conversation[]) ?? [])
      }

      setLoading(false)
    })()
    return () => {
      ok = false
    }
  }, [session?.user?.id, scheduleBounds.rangeStart, scheduleBounds.rangeEnd])

  const studentRows = useMemo(() => filterStudentRoleRows(rows), [rows])
  const primaryGroupId =
    studentRows[0]?.group_id ??
    rows.find((r) => r.role_in_group === 'coordinator')?.group_id ??
    rows[0]?.group_id
  const primaryGroupName = rows.find((r) => r.group_id === primaryGroupId)?.groups?.group_name
  const primaryCohortAccent =
    primaryGroupId != null
      ? normalizeGroupAccent(rows.find((r) => r.group_id === primaryGroupId)?.groups?.accent_color)
      : null

  const todayEvents = useMemo(() => {
    const now = scheduleBounds.now
    return scheduleEvents.filter((ev) => sameLocalDay(new Date(ev.starts_at), now))
  }, [scheduleEvents, scheduleBounds.now])

  const nextWeekEvents = useMemo(() => {
    const now = scheduleBounds.now
    const { nextWeekStart, nextWeekEnd } = scheduleBounds
    return scheduleEvents.filter((ev) => {
      const d = new Date(ev.starts_at)
      if (sameLocalDay(d, now)) return false
      return d.getTime() >= nextWeekStart.getTime() && d.getTime() <= nextWeekEnd.getTime()
    })
  }, [scheduleEvents, scheduleBounds])

  if (loading) return <Loading />

  return (
    <div
      className={`page student-home${primaryCohortAccent ? ' page--cohort' : ''}`}
      style={primaryCohortAccent ? cohortPageSurfaceStyle(primaryCohortAccent) : undefined}
    >
      <PageHeader title="الرئيسية" subtitle="ملخص فوجك، الجدول، والرسائل." />
      <ErrorBanner message={err} />

      {studentRows.length > 1 ? (
        <div className="banner banner--info student-home__warn" role="status">
          يظهر حسابك في أكثر من فوج كطالب. يُفضّل مراجعة الأستاذ أو الدعم لتوحيد العضوية.
        </div>
      ) : null}

      {!primaryGroupId ? (
        <EmptyState
          title="لم تنضم لأي فوج بعد"
          hint={
            <>
              استخدم{' '}
              <Link to="/s/join">صفحة الانضمام</Link> مع كود الأستاذ.
            </>
          }
        />
      ) : null}

      {primaryGroupId ? (
        <>
          <section className="section student-home__section">
            <h2>فوجي</h2>
            <p>
              <Link className="btn btn--secondary" to={`/s/groups/${primaryGroupId}`}>
                {primaryGroupName ?? 'صفحة الفوج'}
              </Link>
            </p>
          </section>

          {publicSlug ? (
            <section className="section student-home__section">
              <h2>الصفحة الرسمية للأستاذ</h2>
              <p className="muted small">الملف العام لمساحة التدريس على Ostadi.</p>
              <Link className="btn btn--secondary" to={`/p/${encodeURIComponent(publicSlug)}`}>
                فتح الصفحة العامة
              </Link>
            </section>
          ) : null}

          <section className="section student-home__section">
            <h2>حصص اليوم</h2>
            {todayEvents.length === 0 ? (
              <p className="muted">لا حصص مجدولة اليوم.</p>
            ) : (
              <ul className="schedule-list">
                {todayEvents.map((ev) => (
                  <li key={ev.id} className="schedule-list__item">
                    <strong>{ev.subject_name ?? (ev.event_type === 'seminar' ? 'ندوة' : 'حصة')}</strong> —{' '}
                    {scheduleEventCreatorLabel(ev)} —{' '}
                    {new Date(ev.starts_at).toLocaleTimeString('ar-MA', { hour: '2-digit', minute: '2-digit' })} →{' '}
                    {new Date(ev.ends_at).toLocaleTimeString('ar-MA', { hour: '2-digit', minute: '2-digit' })}{' '}
                    <span className="muted">({ev.mode === 'online' ? 'عن بُعد' : 'حضوري'})</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="section student-home__section">
            <h2>حصص الأسبوع القادم</h2>
            <p className="muted small">من الاثنين إلى الأحد للأسبوع التالي (بتوقيت جهازك).</p>
            {nextWeekEvents.length === 0 ? (
              <p className="muted">لا حصص في هذا الأسبوع.</p>
            ) : (
              <ul className="schedule-list">
                {nextWeekEvents.map((ev) => (
                  <li key={ev.id} className="schedule-list__item">
                    <strong>{ev.subject_name ?? (ev.event_type === 'seminar' ? 'ندوة' : 'حصة')}</strong> —{' '}
                    {scheduleEventCreatorLabel(ev)} —{' '}
                    {new Date(ev.starts_at).toLocaleString('ar-MA', {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}{' '}
                    <span className="muted">({ev.mode === 'online' ? 'عن بُعد' : 'حضوري'})</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="section student-home__section">
            <div className="student-home__section-head">
              <h2>منشورات الأساتذة</h2>
              <Link to="/s/posts" className="btn btn--ghost btn--small">
                عرض الكل
              </Link>
            </div>
            {postPreview.length === 0 ? (
              <p className="muted">لا منشورات حديثة.</p>
            ) : (
              <ul className="post-list">
                {postPreview.map((p) => (
                  <li key={p.id} className="post-card">
                    {p.pinned ? <span className="pill">مثبت</span> : null}
                    {p.title ? <h4>{p.title}</h4> : null}
                    <p>{p.content.length > 160 ? `${p.content.slice(0, 160)}…` : p.content}</p>
                    <time className="muted small">{new Date(p.created_at).toLocaleString('ar-MA')}</time>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="section student-home__section">
            <div className="student-home__section-head">
              <h2>الرسائل</h2>
              <Link to="/s/messages" className="btn btn--ghost btn--small">
                صندوق الرسائل
              </Link>
            </div>
            {convPreview.length === 0 ? (
              <p className="muted">لا محادثات بعد.</p>
            ) : (
              <ul className="list-links">
                {convPreview.map((c) => (
                  <li key={c.id}>
                    <Link
                      to={`/s/messages/${c.id}`}
                      className={primaryCohortAccent ? 'list-links__link--cohort' : undefined}
                      style={primaryCohortAccent ? cohortListLinkAccentStyle(primaryCohortAccent) : undefined}
                    >
                      {c.subject?.trim() || 'محادثة'}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </div>
  )
}
