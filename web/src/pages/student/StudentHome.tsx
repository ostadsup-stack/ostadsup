import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import type { ScheduleEvent } from '../../types'
import {
  fetchActiveStudentMemberships,
  fetchGroupTeachersWithPublicSlugs,
  filterStudentRoleRows,
  type GroupTeacherPublicRow,
  type StudentMemberRow,
} from '../../lib/studentGroup'
import {
  fetchLatestCampusAdminWallPreview,
  campusWallPostKindLabelAr,
  type CampusAdminWallPreview,
} from '../../lib/campusWall'
import {
  fetchStudentHubMessagePreviews,
  fetchStudentHubPosts,
  type HubCoordinatorAnnouncement,
  type HubMessagePreview,
  type HubPostPinned,
  type HubTeacherPostBlurb,
} from '../../lib/studentHubData'
import { cohortListLinkAccentStyle, cohortPageSurfaceStyle, normalizeGroupAccent } from '../../lib/groupTheme'
import { addDays, sameLocalDay, startOfMonday } from '../../lib/teacherWeekSchedule'
import { scheduleEventCreatorLabel } from '../../lib/scheduleConflict'
import { formatAppDateTime, formatAppTime } from '../../lib/appDateTime'
import { Loading } from '../../components/Loading'
import { ErrorBanner } from '../../components/ErrorBanner'
import { PageHeader } from '../../components/PageHeader'

export function StudentHome() {
  const { session } = useAuth()
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<StudentMemberRow[]>([])
  const [scheduleEvents, setScheduleEvents] = useState<ScheduleEvent[]>([])
  const [adminCampusPreview, setAdminCampusPreview] = useState<CampusAdminWallPreview | null>(null)
  const [pinnedPosts, setPinnedPosts] = useState<HubPostPinned[]>([])
  const [coordinatorAnnouncements, setCoordinatorAnnouncements] = useState<HubCoordinatorAnnouncement[]>([])
  const [latestTeacherAnnouncement, setLatestTeacherAnnouncement] = useState<HubTeacherPostBlurb | null>(null)
  const [latestTeacherGeneral, setLatestTeacherGeneral] = useState<HubTeacherPostBlurb | null>(null)
  const [teacherOfficialRows, setTeacherOfficialRows] = useState<GroupTeacherPublicRow[]>([])
  const [coordMessage, setCoordMessage] = useState<HubMessagePreview | null>(null)
  const [teacherMessages, setTeacherMessages] = useState<HubMessagePreview[]>([])

  const scheduleBounds = useMemo(() => {
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
    const weekMonday = startOfMonday(now)
    const nextWeekStart = addDays(weekMonday, 7)
    const nextWeekEnd = addDays(nextWeekStart, 6)
    nextWeekEnd.setHours(23, 59, 59, 999)
    return {
      now,
      todayStart,
      nextWeekStart,
      nextWeekEnd,
      rangeStart: todayStart.toISOString(),
      rangeEnd: nextWeekEnd.toISOString(),
    }
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
        setAdminCampusPreview(null)
        setPinnedPosts([])
        setCoordinatorAnnouncements([])
        setLatestTeacherAnnouncement(null)
        setLatestTeacherGeneral(null)
        setTeacherOfficialRows([])
        setCoordMessage(null)
        setTeacherMessages([])
        setLoading(false)
        return
      }

      const ws = g0.workspace_id

      const [ev, hubPosts, hubMsgs, adminCampus, teachersPublic] = await Promise.all([
        supabase
          .from('schedule_events')
          .select('*, profiles:profiles!schedule_events_created_by_fkey(full_name)')
          .eq('group_id', gid)
          .gte('starts_at', scheduleBounds.rangeStart)
          .lte('starts_at', scheduleBounds.rangeEnd)
          .order('starts_at', { ascending: true }),
        fetchStudentHubPosts(supabase, ws, gid),
        fetchStudentHubMessagePreviews(supabase, session.user.id, gid),
        fetchLatestCampusAdminWallPreview(supabase),
        fetchGroupTeachersWithPublicSlugs(supabase, gid),
      ])

      if (!ok) return

      const chunkErr =
        ev.error?.message ??
        hubPosts.error ??
        hubMsgs.error ??
        adminCampus.error ??
        teachersPublic.error ??
        null
      setErr(chunkErr)
      setScheduleEvents((ev.data as ScheduleEvent[]) ?? [])
      setPinnedPosts(hubPosts.pinned)
      setCoordinatorAnnouncements(hubPosts.coordinatorAnnouncements)
      setLatestTeacherAnnouncement(hubPosts.latestTeacherAnnouncement)
      setLatestTeacherGeneral(hubPosts.latestTeacherGeneral)
      setAdminCampusPreview(adminCampus.preview)
      setTeacherOfficialRows(teachersPublic.teachers)
      setCoordMessage(hubMsgs.coordinator)
      setTeacherMessages(hubMsgs.teachers)

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
  const primaryGroupRow = rows.find((r) => r.group_id === primaryGroupId)
  const primaryGroupName = primaryGroupRow?.groups?.group_name
  const primaryWhatsappLink = primaryGroupRow?.groups?.whatsapp_link?.trim() || null
  const primaryCohortAccent =
    primaryGroupId != null
      ? normalizeGroupAccent(primaryGroupRow?.groups?.accent_color)
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

  const nextUpcomingEvent = useMemo(() => {
    const now = scheduleBounds.now.getTime()
    const candidates = scheduleEvents
      .filter((ev) => ev.status !== 'cancelled' && new Date(ev.ends_at).getTime() > now)
      .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
    return candidates[0] ?? null
  }, [scheduleEvents, scheduleBounds.now])

  if (loading) return <Loading />

  const hasGroup = Boolean(primaryGroupId)
  const lastCoordinatorAnnouncement = coordinatorAnnouncements[0] ?? null

  return (
    <div
      className={`page student-home${primaryCohortAccent ? ' page--cohort' : ''}`}
      style={primaryCohortAccent ? cohortPageSurfaceStyle(primaryCohortAccent) : undefined}
    >
      <PageHeader
        title="الرئيسية"
        subtitle={
          hasGroup
            ? 'ملخص فوجك: الجدول، إعلانات الإدارة والأساتذة والمنسق، الصفحات الرسمية، والرسائل.'
            : 'انضم لفوجك للوصول إلى الجدول والمنشورات والرسائل.'
        }
      />
      <ErrorBanner message={err} />

      {studentRows.length > 1 ? (
        <div className="banner banner--info student-home__warn" role="status">
          يظهر حسابك في أكثر من فوج كطالب. يُفضّل مراجعة الأستاذ أو الدعم لتوحيد العضوية.
        </div>
      ) : null}

      {!primaryGroupId ? (
        <div className="student-home__join-cta card">
          <h2 className="student-home__join-cta-title">انضم لفوجك</h2>
          <p className="muted student-home__join-cta-text">
            أدخل كود الأستاذ لربط حسابك بفوجك الدراسي والوصول إلى الجدول والمواد والمحادثات.
          </p>
          <Link className="btn btn--primary student-home__join-cta-btn" to="/s/join">
            إضافة / الانضمام لفوج
          </Link>
        </div>
      ) : null}

      {primaryGroupId ? (
        <>
          <div className="student-home__cohort-id card" aria-label="اسم الفوج">
            <h2 className="student-home__cohort-id-name">{primaryGroupName?.trim() || 'فوجي'}</h2>
            <p className="student-home__group-actions">
              <Link className="btn btn--secondary btn--small" to={`/s/groups/${primaryGroupId}`}>
                صفحة الفوج
              </Link>
              {primaryWhatsappLink ? (
                <a
                  className="btn btn--ghost btn--small"
                  href={primaryWhatsappLink}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  واتساب الفوج
                </a>
              ) : null}
            </p>
          </div>

          <section className="section student-home__section">
            <div className="student-home__section-head">
              <h2>حصص اليوم</h2>
              <Link to="/s/schedule" className="btn btn--ghost btn--small">
                الجدول الكامل
              </Link>
            </div>
            {todayEvents.length === 0 ? (
              <p className="muted">لا حصص مجدولة اليوم.</p>
            ) : (
              <ul className="schedule-list">
                {todayEvents.map((ev) => (
                  <li key={ev.id} className="schedule-list__item">
                    <strong>{ev.subject_name ?? (ev.event_type === 'seminar' ? 'ندوة' : 'حصة')}</strong> —{' '}
                    {scheduleEventCreatorLabel(ev)} —{' '}
                    {formatAppTime(ev.starts_at, { hour: '2-digit', minute: '2-digit' })} →{' '}
                    {formatAppTime(ev.ends_at, { hour: '2-digit', minute: '2-digit' })}{' '}
                    <span className="muted">({ev.mode === 'online' ? 'عن بُعد' : 'حضوري'})</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="section student-home__section" aria-label="إعلان الإدارة">
            <div className="student-home__section-head">
              <h2>إعلان الإدارة</h2>
              <Link to="/s/posts" className="btn btn--ghost btn--small">
                حائط الجامعة / الكلية
              </Link>
            </div>
            <p className="muted small">آخر منشور من الإدارة أو بصنف «إعلان إداري» على الحائط العام.</p>
            {adminCampusPreview ? (
              <article className="post-card post-card--workspace-general">
                <span className="pill">{campusWallPostKindLabelAr(adminCampusPreview.postKind)}</span>
                <p className="student-home__post-byline small">
                  <span className="student-home__post-byline-name">
                    {adminCampusPreview.authorName?.trim() || 'الإدارة'}
                  </span>
                  <span className="muted" aria-hidden="true">
                    {' — '}
                  </span>
                  <time dateTime={adminCampusPreview.createdAt}>
                    {formatAppDateTime(adminCampusPreview.createdAt)}
                  </time>
                </p>
                {adminCampusPreview.title ? <h4>{adminCampusPreview.title}</h4> : null}
                <p>{adminCampusPreview.bodySnippet}</p>
              </article>
            ) : (
              <p className="muted">لا إعلان إداري حديث يظهر لك الآن.</p>
            )}
          </section>

          <section className="section student-home__section" aria-label="آخر إعلان من الأساتذة">
            <div className="student-home__section-head">
              <h2>آخر إعلان من الأساتذة</h2>
              <Link to="/s/posts" className="btn btn--ghost btn--small">
                كل المنشورات
              </Link>
            </div>
            {latestTeacherAnnouncement ? (
              <article
                className={`post-card ${latestTeacherAnnouncement.scope === 'group' ? 'post-card--cohort' : 'post-card--workspace-general'}`}
              >
                <span className="pill">إعلان</span>
                <p className="student-home__post-byline small">
                  <span className="student-home__post-byline-name">{latestTeacherAnnouncement.authorName}</span>
                  <span className="muted" aria-hidden="true">
                    {' — '}
                  </span>
                  <time dateTime={latestTeacherAnnouncement.createdAt}>
                    {formatAppDateTime(latestTeacherAnnouncement.createdAt)}
                  </time>
                </p>
                <span className="pill">{latestTeacherAnnouncement.scope === 'group' ? 'الفوج' : 'عام'}</span>
                {latestTeacherAnnouncement.title ? (
                  <p className="small">
                    <strong>{latestTeacherAnnouncement.title}</strong>
                  </p>
                ) : null}
                <p>{latestTeacherAnnouncement.contentPreview}</p>
              </article>
            ) : (
              <p className="muted">لا يوجد إعلان (نوع «إعلان») من أستاذ في آخر التحديثات المعروضة.</p>
            )}
          </section>

          <section className="section student-home__section" aria-label="آخر منشور من الأساتذة">
            <div className="student-home__section-head">
              <h2>آخر منشور من الأساتذة</h2>
              <Link to="/s/posts" className="btn btn--ghost btn--small">
                كل المنشورات
              </Link>
            </div>
            {latestTeacherGeneral ? (
              <article
                className={`post-card ${latestTeacherGeneral.scope === 'group' ? 'post-card--cohort' : 'post-card--workspace-general'}`}
              >
                <p className="student-home__post-byline small">
                  <span className="student-home__post-byline-name">{latestTeacherGeneral.authorName}</span>
                  <span className="muted" aria-hidden="true">
                    {' — '}
                  </span>
                  <time dateTime={latestTeacherGeneral.createdAt}>
                    {formatAppDateTime(latestTeacherGeneral.createdAt)}
                  </time>
                </p>
                <span className="pill">{latestTeacherGeneral.scope === 'group' ? 'الفوج' : 'عام'}</span>
                {latestTeacherGeneral.title ? (
                  <p className="small">
                    <strong>{latestTeacherGeneral.title}</strong>
                  </p>
                ) : null}
                <p>{latestTeacherGeneral.contentPreview}</p>
              </article>
            ) : (
              <p className="muted">لا منشورات عامة من الأساتذة بعد (غير الإعلانات المخصصة).</p>
            )}
          </section>

          {pinnedPosts.length > 0 ? (
            <section className="section student-home__section">
              <div className="student-home__section-head">
                <h2>منشورات مثبتة</h2>
                <Link to="/s/posts" className="btn btn--ghost btn--small">
                  كل المنشورات
                </Link>
              </div>
              <ul className="post-list">
                {pinnedPosts.map((p) => (
                  <li
                    key={p.id}
                    className={`post-card ${p.scope === 'group' ? 'post-card--cohort' : 'post-card--workspace-general'}`}
                  >
                    <span className="pill">مثبت</span>
                    <p className="student-home__post-byline small">
                      <span className="student-home__post-byline-name">{p.authorName?.trim() || 'مؤلف المنشور'}</span>
                      <span className="muted" aria-hidden="true">
                        {' — '}
                      </span>
                      <time dateTime={p.createdAt}>{formatAppDateTime(p.createdAt)}</time>
                    </p>
                    <span className="pill">{p.scope === 'group' ? 'الفوج' : 'عام'}</span>
                    {p.title ? <h4>{p.title}</h4> : null}
                    <p>{p.content.length > 160 ? `${p.content.slice(0, 160)}…` : p.content}</p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="section student-home__section" aria-label="المنسق — آخر إعلان وتواصل">
            <div className="student-home__section-head">
              <h2>المنسق — آخر إعلان وتواصل</h2>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                <Link to="/s/posts" className="btn btn--ghost btn--small">
                  كل المنشورات
                </Link>
                <Link to="/s/messages" className="btn btn--ghost btn--small">
                  كل الرسائل
                </Link>
              </div>
            </div>
            {lastCoordinatorAnnouncement ? (
              <article className="post-card post-card--cohort" style={{ marginBottom: '1rem' }}>
                <span className="pill pill--coord">آخر إعلان للمنسق</span>
                <p className="student-home__post-byline small">
                  <span className="student-home__post-byline-name">
                    {lastCoordinatorAnnouncement.authorName?.trim() || 'منسق'}
                  </span>
                  <span className="muted" aria-hidden="true">
                    {' — '}
                  </span>
                  <time dateTime={lastCoordinatorAnnouncement.createdAt}>
                    {formatAppDateTime(lastCoordinatorAnnouncement.createdAt)}
                  </time>
                </p>
                {lastCoordinatorAnnouncement.title ? <h4>{lastCoordinatorAnnouncement.title}</h4> : null}
                <p>
                  {lastCoordinatorAnnouncement.content.length > 200
                    ? `${lastCoordinatorAnnouncement.content.slice(0, 200)}…`
                    : lastCoordinatorAnnouncement.content}
                </p>
              </article>
            ) : (
              <p className="muted" style={{ marginBottom: '0.75rem' }}>
                لا إعلان منسق في آخر التحديثات المعروضة.
              </p>
            )}
            <h3 className="student-home__next-slot-title" style={{ fontSize: '0.92rem' }}>
              تواصل مع المنسق
            </h3>
            <p className="muted small">آخر نشاط في محادثتك مع المنسق؛ أو ابدأ من صفحة الفوج.</p>
            <p className="student-home__group-actions">
              <Link className="btn btn--secondary btn--small" to={`/s/groups/${primaryGroupId}`}>
                صفحة الفوج (مراسلة المنسق)
              </Link>
            </p>
            {coordMessage ? (
              <Link
                to={`/s/messages/${coordMessage.conversationId}`}
                className="student-home__preview-link"
                style={primaryCohortAccent ? cohortListLinkAccentStyle(primaryCohortAccent) : undefined}
              >
                <span className="student-home__preview-meta">{coordMessage.headline}</span>
                <span className="student-home__preview-snippet">
                  {coordMessage.body.length > 120 ? `${coordMessage.body.slice(0, 120)}…` : coordMessage.body}
                </span>
                <time className="muted small">{formatAppDateTime(coordMessage.createdAt)}</time>
              </Link>
            ) : (
              <p className="muted">لا محادثة مع المنسق بعد. استخدم «صفحة الفوج» أعلاه لبدء التواصل.</p>
            )}
          </section>

          <section className="section student-home__section" aria-label="الصفحة الرسمية لكل أستاذ">
            <div className="student-home__section-head">
              <h2>الصفحة الرسمية لكل أستاذ</h2>
            </div>
            <p className="muted small">رابط الملف العام على Ostadi لكل أستاذ في الفوج (إن وُجدت مساحة بصفحة عامة).</p>
            {teacherOfficialRows.length === 0 ? (
              <p className="muted">لا يظهر أستاذ مرتبط بهذا الفوج في القائمة.</p>
            ) : (
              <ul className="student-home__official-grid">
                {teacherOfficialRows.map((t) => (
                  <li key={t.id} className="student-home__official-card">
                    <p className="student-home__official-card-name">{t.full_name}</p>
                    {t.own_public_slug ? (
                      <Link
                        className="btn btn--secondary btn--small"
                        to={`/p/${encodeURIComponent(t.own_public_slug)}`}
                      >
                        الصفحة الرسمية
                      </Link>
                    ) : (
                      <span className="muted small">لا صفحة عامة مفعّلة</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="section student-home__section" aria-label="التواصل مع الأستاذ">
            <div className="student-home__section-head">
              <h2>التواصل مع الأستاذ</h2>
              <Link to="/s/messages" className="btn btn--ghost btn--small">
                صندوق الرسائل
              </Link>
            </div>
            <p className="muted small">قناة خاصة مع كل أستاذ؛ آخر رسالة تظهر أدناه.</p>
            <p className="student-home__group-actions">
              <Link className="btn btn--secondary btn--small" to={`/s/groups/${primaryGroupId}`}>
                صفحة الفوج (مراسلة أستاذ)
              </Link>
            </p>
            {teacherMessages.length === 0 ? (
              <p className="muted">لا محادثات مع الأساتذة بعد.</p>
            ) : (
              <ul className="student-home__preview-list">
                {teacherMessages.map((m) => (
                  <li key={m.conversationId}>
                    <Link
                      to={`/s/messages/${m.conversationId}`}
                      className={
                        primaryCohortAccent
                          ? 'student-home__preview-link list-links__link--cohort'
                          : 'student-home__preview-link'
                      }
                      style={primaryCohortAccent ? cohortListLinkAccentStyle(primaryCohortAccent) : undefined}
                    >
                      <span className="student-home__preview-meta">{m.headline}</span>
                      <span className="student-home__preview-snippet">
                        {m.body.length > 100 ? `${m.body.slice(0, 100)}…` : m.body}
                      </span>
                      <time className="muted small">{formatAppDateTime(m.createdAt)}</time>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {nextUpcomingEvent ? (
            <section className="section student-home__section student-home__next-slot" aria-label="الحصة التالية">
              <h2 className="student-home__next-slot-title">الحصة التالية</h2>
              <div className="student-home__next-slot-body">
                <p className="student-home__next-slot-line">
                  <strong>
                    {nextUpcomingEvent.subject_name ??
                      (nextUpcomingEvent.event_type === 'seminar' ? 'ندوة' : 'حصة')}
                  </strong>
                  {' — '}
                  {scheduleEventCreatorLabel(nextUpcomingEvent)}
                </p>
                <p className="muted small">
                  {formatAppDateTime(nextUpcomingEvent.starts_at, {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                  {' — '}
                  {nextUpcomingEvent.mode === 'online' ? 'عن بُعد' : 'حضوري'}
                  {nextUpcomingEvent.location ? ` — ${nextUpcomingEvent.location}` : ''}
                </p>
                {nextUpcomingEvent.mode === 'online' && nextUpcomingEvent.meeting_link ? (
                  <p className="student-home__next-slot-link">
                    <a
                      className="btn btn--secondary btn--small"
                      href={nextUpcomingEvent.meeting_link}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      فتح رابط الحصة
                    </a>
                  </p>
                ) : null}
              </div>
            </section>
          ) : null}

          <section className="section student-home__section">
            <div className="student-home__section-head">
              <h2>حصص الأسبوع القادم</h2>
              <Link to="/s/schedule" className="btn btn--ghost btn--small">
                الجدول الكامل
              </Link>
            </div>
            <p className="muted small">من الاثنين إلى الأحد للأسبوع التالي (بتوقيت جهازك).</p>
            {nextWeekEvents.length === 0 ? (
              <p className="muted">لا حصص في هذا الأسبوع.</p>
            ) : (
              <ul className="schedule-list">
                {nextWeekEvents.map((ev) => (
                  <li key={ev.id} className="schedule-list__item">
                    <strong>{ev.subject_name ?? (ev.event_type === 'seminar' ? 'ندوة' : 'حصة')}</strong> —{' '}
                    {scheduleEventCreatorLabel(ev)} —{' '}
                    {formatAppDateTime(ev.starts_at, {
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
        </>
      ) : null}
    </div>
  )
}
