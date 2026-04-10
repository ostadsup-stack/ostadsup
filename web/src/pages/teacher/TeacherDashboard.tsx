import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { fetchWorkspaceForTeacher } from '../../lib/workspace'
import { whatsappHref } from '../../lib/whatsapp'
import {
  addDays,
  startOfMonday,
  fetchTeacherWeekScheduleRows,
  emptyScheduleOverlapAudit,
  type ScheduleWeekEventRow,
} from '../../lib/teacherWeekSchedule'
import { Loading } from '../../components/Loading'
import { ErrorBanner } from '../../components/ErrorBanner'
import { ScheduleOverlapBanners } from '../../components/ScheduleOverlapBanners'
import { TeacherWeekScheduleGrid } from '../../components/teacher/TeacherWeekScheduleGrid'

export function TeacherDashboard() {
  const { session, profile } = useAuth()
  const [err, setErr] = useState<string | null>(null)
  const [summary, setSummary] = useState<{
    groups: number
    openConversations: number
    unreadNotif: number
  } | null>(null)
  const [workspaceSlug, setWorkspaceSlug] = useState<string | null>(null)
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)
  const [weekOffset, setWeekOffset] = useState(0)
  const [schedRows, setSchedRows] = useState<ScheduleWeekEventRow[]>([])
  const [schedLoading, setSchedLoading] = useState(false)
  const [schedErr, setSchedErr] = useState<string | null>(null)
  const [schedOverlapAudit, setSchedOverlapAudit] = useState(emptyScheduleOverlapAudit)

  useEffect(() => {
    let ok = true
    ;(async () => {
      if (!session?.user?.id) return
      const { workspace, error: wErr } = await fetchWorkspaceForTeacher(session.user.id)
      if (wErr || !workspace) {
        if (ok) {
          setErr(wErr?.message ?? 'لم يُعثر على مساحة الأستاذ')
          setSummary({ groups: 0, openConversations: 0, unreadNotif: 0 })
          setWorkspaceSlug(null)
          setWorkspaceId(null)
        }
        return
      }
      const wsId = workspace.id as string
      if (ok) {
        setWorkspaceSlug((workspace.slug as string) ?? null)
        setWorkspaceId(wsId)
      }
      const [g, c, n] = await Promise.all([
        supabase.from('groups').select('id', { count: 'exact', head: true }).eq('workspace_id', wsId),
        supabase
          .from('conversations')
          .select('id', { count: 'exact', head: true })
          .eq('workspace_id', wsId)
          .eq('status', 'open'),
        supabase
          .from('notifications')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', session.user.id)
          .eq('is_read', false),
      ])
      if (!ok) return
      setSummary({
        groups: g.count ?? 0,
        openConversations: c.count ?? 0,
        unreadNotif: n.count ?? 0,
      })
    })()
    return () => {
      ok = false
    }
  }, [session?.user?.id])

  useEffect(() => {
    let ok = true
    const uid = session?.user?.id
    if (!uid || !workspaceId) {
      setSchedRows([])
      setSchedLoading(false)
      setSchedOverlapAudit(emptyScheduleOverlapAudit)
      return
    }
    ;(async () => {
      setSchedLoading(true)
      setSchedErr(null)
      const weekStart = addDays(startOfMonday(new Date()), weekOffset * 7)
      const weekEnd = addDays(weekStart, 6)
      weekEnd.setHours(23, 59, 59, 999)
      const { rows, error, overlapAudit } = await fetchTeacherWeekScheduleRows(
        supabase,
        uid,
        workspaceId,
        weekStart,
        weekEnd,
      )
      if (!ok) return
      setSchedLoading(false)
      if (error) {
        setSchedErr(error)
        setSchedRows([])
        setSchedOverlapAudit(emptyScheduleOverlapAudit)
      } else {
        setSchedErr(null)
        setSchedRows(rows)
        setSchedOverlapAudit(overlapAudit)
      }
    })()
    return () => {
      ok = false
    }
  }, [session?.user?.id, workspaceId, weekOffset])

  if (!session?.user?.id) return <Loading />

  const displayName = profile?.full_name?.trim() || 'أستاذ'
  const initial = displayName.charAt(0) || '?'
  const bio = profile?.bio?.trim() ?? ''
  const phone = profile?.phone?.trim() ?? ''
  const wa = profile?.whatsapp?.trim() ?? ''
  const waLink = wa ? whatsappHref(wa) : null
  const office = profile?.office_hours?.trim() ?? ''

  return (
    <div className="page">
      <header className="teacher-home__masthead">
        <h1 className="page-header__title teacher-home__title">
          الأستاذ <span className="teacher-home__masthead-name">{displayName}</span>
        </h1>
        <p className="teacher-home__masthead-actions muted">
          <Link to="/t/account" className="teacher-home__masthead-add">
            أضف
          </Link>
          {' '}
          نبذة أو قنوات تواصل من <Link to="/t/account">حسابي</Link>.
        </p>
        {workspaceSlug ? (
          <p className="teacher-home__public-page-hint muted small">
            <strong className="teacher-home__public-page-label">صفحتك العامة للزوار:</strong>{' '}
            <a
              href={`/p/${encodeURIComponent(workspaceSlug)}`}
              target="_blank"
              rel="noreferrer noopener"
              className="teacher-home__inline-link"
            >
              فتح الصفحة الرسمية
            </a>
            {' — '}
            تظهر فيها الهوية، المكتبة، منشورات المساحة، والتواصل كما يضبطان من «حسابي» و«مكتبتي» والمنشورات على مستوى المساحة.
          </p>
        ) : null}
      </header>
      <ErrorBanner message={err} />

      {!profile ? (
        <Loading label="جاري التحميل…" />
      ) : (
        <>
          <section className="teacher-home__identity-card" aria-labelledby="teacher-home-profile-heading">
            <h2 id="teacher-home-profile-heading" className="visually-hidden">
              بطاقة التعريف
            </h2>
            <div className="teacher-home__identity-media">
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt="" className="teacher-home__identity-avatar" />
              ) : (
                <div className="teacher-home__identity-avatar teacher-home__identity-avatar--placeholder" aria-hidden>
                  {initial}
                </div>
              )}
            </div>
            <div className="teacher-home__identity-body">
              <p className="teacher-home__identity-name">{displayName}</p>
              {bio ? (
                <p className="teacher-home__bio">{bio}</p>
              ) : (
                <p className="teacher-home__bio teacher-home__bio--empty muted">
                  أضف نبذة تعريفية من{' '}
                  <Link to="/t/account" className="teacher-home__inline-link">
                    حسابي
                  </Link>
                  .
                </p>
              )}
              <div className="teacher-home__channels">
                {phone ? (
                  <a href={`tel:${phone.replace(/\s/g, '')}`} className="btn btn--ghost teacher-home__channel-btn" dir="ltr">
                    هاتف
                  </a>
                ) : null}
                {waLink ? (
                  <a
                    href={waLink}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="btn btn--ghost teacher-home__channel-btn"
                  >
                    واتساب
                  </a>
                ) : null}
                {!phone && !waLink ? (
                  <span className="muted teacher-home__channels-hint">
                    أضف هاتفاً أو واتساب من <Link to="/t/account">حسابي</Link>.
                  </span>
                ) : null}
              </div>
              {office ? (
                <div className="teacher-home__office">
                  <span className="teacher-home__office-label">أوقات التواصل</span>
                  <p className="teacher-home__office-text">{office}</p>
                </div>
              ) : null}
            </div>
          </section>

          {workspaceId ? (
            <section className="section teacher-home__week-schedule" aria-labelledby="teacher-home-schedule-h">
              <h2 id="teacher-home-schedule-h" className="library-section__title">
                حصص هذا الأسبوع
              </h2>
              <p className="muted small teacher-home__schedule-hint">
                انقر على حصة للانتقال إلى الفوج وتعديلها أو حذفها أو إعادة جدولتها.
              </p>
              <ScheduleOverlapBanners audit={schedOverlapAudit} />
              {schedErr ? <p className="muted small">{schedErr}</p> : null}
              <TeacherWeekScheduleGrid
                rows={schedRows}
                weekOffset={weekOffset}
                onWeekOffsetChange={setWeekOffset}
                loading={schedLoading}
                buildEventLink={(ev) => `/t/groups/${ev.group_id}?event=${encodeURIComponent(ev.id)}`}
                emptyHint="لا حصص هذا الأسبوع. أضفها من صفحة كل فوج أو من «جدول الحصص» في القائمة."
              />
            </section>
          ) : null}

          {!summary ? (
            <Loading label="جاري التحميل…" />
          ) : (
            <section className="teacher-home__stats" aria-label="مؤشرات سريعة">
              <Link to="/t/groups" className="teacher-home__stat">
                <span className="teacher-home__stat-value">{summary.groups}</span>
                <span className="teacher-home__stat-label">أفواج</span>
              </Link>
              <Link to="/t/inbox" className="teacher-home__stat">
                <span className="teacher-home__stat-value">{summary.openConversations}</span>
                <span className="teacher-home__stat-label">محادثات مفتوحة</span>
              </Link>
              <Link to="/t/notifications" className="teacher-home__stat">
                <span className="teacher-home__stat-value">{summary.unreadNotif}</span>
                <span className="teacher-home__stat-label">إشعارات غير مقروءة</span>
              </Link>
            </section>
          )}
        </>
      )}
    </div>
  )
}
