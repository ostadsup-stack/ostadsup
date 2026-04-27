import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { fetchWorkspaceForTeacher } from '../../lib/workspace'
import { supabase } from '../../lib/supabase'
import type { PublicScheduleTeaserRow, PublicTeacherPageRow } from '../../types'
import {
  computeLiveSessionIndicator,
  fetchLiveSessionEventsForTeacher,
  type LiveSessionIndicator,
} from '../../lib/liveSessionHeader'
import { Loading } from '../../components/Loading'
import { EmptyState } from '../../components/EmptyState'
import { jitsiUrlForPublicWorkspaceSlug } from '../../lib/publicLiveLinks'

const GOOGLE_MEET_NEW_URL = 'https://meet.google.com/new'

export function PublicTeacherLivePage() {
  const { slug } = useParams<{ slug: string }>()
  const { session, profile } = useAuth()
  const [row, setRow] = useState<PublicTeacherPageRow | null>(null)
  const [schedule, setSchedule] = useState<PublicScheduleTeaserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [isOwnerTeacher, setIsOwnerTeacher] = useState(false)
  const [ownerIndicator, setOwnerIndicator] = useState<LiveSessionIndicator | null>(null)

  const s = slug?.trim() ?? ''
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const livePageUrl = s ? `${origin}/p/${encodeURIComponent(s)}/live` : ''
  const jitsiUrl = s ? jitsiUrlForPublicWorkspaceSlug(s) : null

  useEffect(() => {
    if (!s) {
      setErr(null)
      setRow(null)
      setSchedule([])
      setLoading(false)
      return
    }
    let ok = true
    setLoading(true)
    setErr(null)
    ;(async () => {
      const profRes = await supabase.rpc('public_teacher_by_workspace_slug', { p_slug: s })
      if (!ok) return
      if (profRes.error) {
        setErr(profRes.error.message)
        setRow(null)
        setSchedule([])
        setLoading(false)
        return
      }
      const list = profRes.data as PublicTeacherPageRow[] | null
      setRow(list && list.length > 0 ? list[0] : null)

      const schedRes = await supabase.rpc('public_workspace_schedule_teaser_by_slug', { p_slug: s })
      if (!ok) return
      setSchedule(schedRes.error ? [] : ((schedRes.data as PublicScheduleTeaserRow[]) ?? []))
      setLoading(false)
    })()
    return () => {
      ok = false
    }
  }, [s])

  useEffect(() => {
    let ok = true
    const uid = session?.user?.id
    if (!s || !uid || profile?.role !== 'teacher') {
      setIsOwnerTeacher(false)
      setOwnerIndicator(null)
      return
    }
    const userId = uid
    async function loadOwner() {
      const { workspace } = await fetchWorkspaceForTeacher(userId)
      if (!ok) return
      const mine = workspace?.slug != null && String(workspace.slug) === s
      setIsOwnerTeacher(mine)
      if (!mine || !workspace?.id) {
        setOwnerIndicator(null)
        return
      }
      const evRows = await fetchLiveSessionEventsForTeacher(supabase, workspace.id as string, userId)
      const computed = computeLiveSessionIndicator(Date.now(), evRows)
      setOwnerIndicator(computed?.indicator ?? null)
    }
    void loadOwner()
    const interval = window.setInterval(() => void loadOwner(), 60_000)
    return () => {
      ok = false
      window.clearInterval(interval)
    }
  }, [s, session?.user?.id, profile?.role])

  const publicOnlineRows = useMemo(
    () =>
      schedule
        .filter((e) => (e.event_type ?? 'class') === 'class' && e.mode === 'online')
        .map((e) => ({
          id: e.id,
          workspace_id: '',
          group_id: '',
          starts_at: e.starts_at,
          ends_at: e.ends_at,
          status: 'planned',
          event_type: 'class',
          mode: 'online',
          meeting_link: null,
          meeting_provider: 'jitsi',
          online_join_enabled: true,
          workspaces: { slug: s },
        })),
    [schedule, s],
  )

  const [publicIndicator, setPublicIndicator] = useState<LiveSessionIndicator | null>(null)
  useEffect(() => {
    if (isOwnerTeacher) {
      setPublicIndicator(null)
      return
    }
    function tick() {
      const next =
        publicOnlineRows.length > 0 ? computeLiveSessionIndicator(Date.now(), publicOnlineRows) : null
      setPublicIndicator(next?.indicator ?? null)
    }
    tick()
    const t = window.setInterval(tick, 60_000)
    return () => window.clearInterval(t)
  }, [isOwnerTeacher, publicOnlineRows])

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      /* ignore */
    }
  }

  if (loading) {
    return (
      <div className="layout layout--public">
        <header className="header header--simple">
          <Link to="/" className="header__brand">
            Ostadi
          </Link>
        </header>
        <main className="main main--narrow main--public">
          <Loading />
        </main>
      </div>
    )
  }

  if (err || !row) {
    return (
      <div className="layout layout--public">
        <header className="header header--simple">
          <Link to="/" className="header__brand">
            Ostadi
          </Link>
        </header>
        <main className="main main--narrow main--public">
          <EmptyState title="المساحة غير موجودة" hint={err ?? 'تأكد من صحة الرابط.'} />
          <p className="muted">
            <Link to="/">العودة للرئيسية</Link>
          </p>
        </main>
      </div>
    )
  }

  const displayName = row.full_name?.trim() || 'الأستاذ'
  const indicator = isOwnerTeacher ? ownerIndicator : publicIndicator

  return (
    <div className="layout layout--public">
      <header className="header header--simple">
        <Link to="/" className="header__brand">
          Ostadi
        </Link>
      </header>
      <main className="main main--narrow main--public public-live-page">
        <h1 className="public-live-page__title">حصة عن بعد — {displayName}</h1>
        <p className="muted public-live-page__lead">
          رابط ثابت لصفحة الحصة؛ انسخه للطلاب أو ضعه في المنشورات. الحالة تُستمد من جدول الحصص الأونلاين في
          المنصّة.
        </p>

        {indicator ? (
          <p className="public-live-page__status" role="status">
            <span
              className={
                indicator.kind === 'green'
                  ? 'live-session-dot live-session-dot--green'
                  : indicator.kind === 'orange'
                    ? 'live-session-dot live-session-dot--orange'
                    : 'live-session-dot live-session-dot--red'
              }
              aria-hidden
            />
            <span>{indicator.label}</span>
          </p>
        ) : null}

        <section className="public-live-page__card">
          <h2 className="public-live-page__h2">رابط هذه الصفحة</h2>
          <p className="mono input--ltr public-live-page__url" dir="ltr">
            {livePageUrl}
          </p>
          <button type="button" className="btn btn--small" onClick={() => void copyText(livePageUrl)}>
            نسخ الرابط
          </button>
        </section>

        <div className="public-live-page__meet-grid">
          {jitsiUrl ? (
            <section className="public-live-page__card">
              <h2 className="public-live-page__h2">اقتراح غرفة Jitsi Meet</h2>
              <p className="muted small">
                غرفة ثابتة مرتبطة بمعرّف مساحتك العامة. يمكنك استخدام رابط آخر (Google Meet أو Zoom وغيره) عبر حقل «رابط
                الاجتماع» في جدول الحصص.
              </p>
              <p className="mono input--ltr public-live-page__url" dir="ltr">
                {jitsiUrl}
              </p>
              <div className="public-live-page__actions">
                <button type="button" className="btn btn--small" onClick={() => void copyText(jitsiUrl)}>
                  نسخ رابط Jitsi
                </button>
                <a className="btn btn--small btn--primary" href={jitsiUrl} target="_blank" rel="noreferrer noopener">
                  فتح الغرفة
                </a>
              </div>
            </section>
          ) : null}

          <section className="public-live-page__card">
            <h2 className="public-live-page__h2">Google Meet</h2>
            <p className="muted small">
              يفتح Meet لبدء اجتماع فوري (يتطلّب حساب Google). بعد بدء الاجتماع انسخ رابط الدعوة من المتصفح أو من «مشاركة
              الاجتماع» وأرسله للطلاب، أو الصقه في حقل «رابط الاجتماع» في جدول الحصص.
            </p>
            <p className="mono input--ltr public-live-page__url" dir="ltr">
              {GOOGLE_MEET_NEW_URL}
            </p>
            <div className="public-live-page__actions">
              <button type="button" className="btn btn--small" onClick={() => void copyText(GOOGLE_MEET_NEW_URL)}>
                نسخ الرابط
              </button>
              <a
                className="btn btn--small btn--primary"
                href={GOOGLE_MEET_NEW_URL}
                target="_blank"
                rel="noreferrer noopener"
              >
                فتح Google Meet
              </a>
            </div>
          </section>
        </div>

        <p className="muted small">
          <Link to={`/p/${encodeURIComponent(s)}`}>← الصفحة الرسمية للأستاذ</Link>
          {session ? (
            <>
              {' · '}
              {profile?.role === 'teacher' ? (
                <Link to="/t">لوحة الأستاذ</Link>
              ) : profile?.role === 'student' ? (
                <Link to="/s">لوحة الطالب</Link>
              ) : null}
            </>
          ) : null}
        </p>
      </main>
    </div>
  )
}
