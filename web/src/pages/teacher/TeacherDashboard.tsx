import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { fetchWorkspaceForTeacher } from '../../lib/workspace'
import { fetchTeacherWeekScheduleRows, sameLocalDay, type ScheduleWeekEventRow } from '../../lib/teacherWeekSchedule'
import { scheduleEventCreatorLabel } from '../../lib/scheduleConflict'
import { localTodayBoundsIso, normalizeTeacherGroupSummaryRows, studyLevelLabelAr } from '../../lib/teacherGroups'
import type { StudyLevel, TeacherGroupSummaryRow } from '../../types'
import { DEFAULT_GROUP_ACCENT } from '../../lib/groupTheme'
import { rgbaFromHex } from '../../lib/colorContrast'
import { Loading } from '../../components/Loading'
import { ErrorBanner } from '../../components/ErrorBanner'

const STUDY_LEVEL_BLOCKS: { level: StudyLevel; heading: string }[] = [
  { level: 'licence', heading: 'إجازة' },
  { level: 'master', heading: 'ماستر' },
  { level: 'doctorate', heading: 'دكتوراه' },
]

function renderGroupRows(rows: TeacherGroupSummaryRow[]) {
  return (
    <div className="teacher-groups__sheet teacher-home__groups-sheet">
      <div className="teacher-groups__thead teacher-home__groups-thead" aria-hidden>
        <span className="teacher-groups__th teacher-groups__th--accent" />
        <span className="teacher-groups__th">اسم الفوج</span>
        <span className="teacher-groups__th">المستوى</span>
        <span className="teacher-groups__th">عادي / ميسر</span>
        <span className="teacher-groups__th">المنسق</span>
        <span className="teacher-groups__th teacher-groups__th--meta" />
      </div>
      <ul className="teacher-groups__list teacher-groups__list--lines">
        {rows.map((r) => {
          const accent =
            r.accent_color && /^#[0-9A-Fa-f]{6}$/.test(r.accent_color) ? r.accent_color : DEFAULT_GROUP_ACCENT
          const coordUnread = r.unread_coordinator_count
          const rowBg = rgbaFromHex(accent, 0.08) ?? undefined
          const hasCoordinator = Boolean(r.coordinator_name?.trim())
          return (
            <li key={r.group_id}>
              <Link
                to={`/t/groups/${r.group_id}`}
                className="teacher-groups__row-line"
                style={{ backgroundColor: rowBg }}
              >
                <span
                  className="teacher-groups__row-accent teacher-groups__row-accent--line"
                  style={{ backgroundColor: accent }}
                  aria-hidden
                />
                <span className="teacher-groups__cell teacher-groups__cell--name">{r.group_name}</span>
                <span className="teacher-groups__cell muted">{studyLevelLabelAr(r.study_level)}</span>
                <span className="teacher-groups__cell teacher-home__groups-mode" title="وجود منسّق للفوج">
                  {hasCoordinator ? (
                    <span className="pill pill--compact teacher-home__pill-misir">ميسر</span>
                  ) : (
                    <span className="pill pill--compact teacher-home__pill-adi">عادي</span>
                  )}
                </span>
                <span className="teacher-groups__cell teacher-groups__cell--coord" title="منسق الفوج">
                  <span className="teacher-groups__coord-name">{r.coordinator_name?.trim() || '—'}</span>
                  {coordUnread > 0 ? (
                    <span
                      className="teacher-groups__coord-unread teacher-groups__coord-unread--inline teacher-home__coord-msg-badge"
                      title="رسائل غير مقروءة من المنسق"
                    >
                      {coordUnread > 99 ? '99+' : coordUnread}
                    </span>
                  ) : null}
                </span>
                <span className="teacher-groups__cell teacher-groups__cell--meta">
                  {r.is_owner === false ? <span className="pill teacher-groups__compact-pill">مرتبط</span> : null}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

type QuickExpanded = null | 'announce' | 'post'

export function TeacherDashboard() {
  const { session, profile } = useAuth()
  const [err, setErr] = useState<string | null>(null)
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)

  const [expandedQuick, setExpandedQuick] = useState<QuickExpanded>(null)

  const [annAudience, setAnnAudience] = useState<'workspace' | 'group'>('group')
  const [annGroupId, setAnnGroupId] = useState('')
  const [annTitle, setAnnTitle] = useState('')
  const [annContent, setAnnContent] = useState('')
  const [annSaving, setAnnSaving] = useState(false)
  const [annErr, setAnnErr] = useState<string | null>(null)
  const [annOk, setAnnOk] = useState<string | null>(null)

  const [postAudience, setPostAudience] = useState<'workspace' | 'group'>('group')
  const [postGroupId, setPostGroupId] = useState('')
  const [postTitle, setPostTitle] = useState('')
  const [postContent, setPostContent] = useState('')
  const [postSaving, setPostSaving] = useState(false)
  const [postErr, setPostErr] = useState<string | null>(null)
  const [postOk, setPostOk] = useState<string | null>(null)

  const [groupRows, setGroupRows] = useState<TeacherGroupSummaryRow[]>([])
  const [groupsListErr, setGroupsListErr] = useState<string | null>(null)
  const [groupsListLoading, setGroupsListLoading] = useState(false)

  const [todayRows, setTodayRows] = useState<ScheduleWeekEventRow[]>([])
  const [todayErr, setTodayErr] = useState<string | null>(null)
  const [todayLoading, setTodayLoading] = useState(false)

  const todayNow = useMemo(() => new Date(), [])

  const todayEvents = useMemo(() => {
    const now = new Date()
    return todayRows.filter((ev) => sameLocalDay(new Date(ev.starts_at), now))
  }, [todayRows])

  const firstGroupId = useMemo(() => groupRows[0]?.group_id ?? null, [groupRows])

  const groupsByLevel = useMemo(() => {
    const map: Record<StudyLevel, TeacherGroupSummaryRow[]> = {
      licence: [],
      master: [],
      doctorate: [],
    }
    const other: TeacherGroupSummaryRow[] = []
    for (const r of groupRows) {
      const sl = r.study_level
      if (sl === 'licence' || sl === 'master' || sl === 'doctorate') {
        map[sl].push(r)
      } else {
        other.push(r)
      }
    }
    return { map, other }
  }, [groupRows])

  const coordinatorUnreadRows = useMemo(
    () => groupRows.filter((r) => r.unread_coordinator_count > 0),
    [groupRows],
  )

  useEffect(() => {
    let ok = true
    ;(async () => {
      if (!session?.user?.id) return
      const { workspace, error: wErr } = await fetchWorkspaceForTeacher(session.user.id)
      if (wErr || !workspace) {
        if (ok) {
          setErr(wErr?.message ?? 'لم يُعثر على مساحة الأستاذ')
          setWorkspaceId(null)
        }
        return
      }
      if (ok) setWorkspaceId(workspace.id as string)
      if (ok) setErr(null)
    })()
    return () => {
      ok = false
    }
  }, [session?.user?.id])

  useEffect(() => {
    let ok = true
    const uid = session?.user?.id
    if (!uid || !workspaceId) {
      setGroupRows([])
      setTodayRows([])
      setGroupsListLoading(false)
      setTodayLoading(false)
      return
    }
    ;(async () => {
      setGroupsListLoading(true)
      setTodayLoading(true)
      setGroupsListErr(null)
      setTodayErr(null)
      const bounds = localTodayBoundsIso()
      const n = new Date()
      const dayStart = new Date(n.getFullYear(), n.getMonth(), n.getDate(), 0, 0, 0, 0)
      const dayEnd = new Date(n.getFullYear(), n.getMonth(), n.getDate(), 23, 59, 59, 999)
      const [rpcRes, schedRes] = await Promise.all([
        supabase.rpc('teacher_group_list_summaries', {
          p_today_start: bounds.p_today_start,
          p_today_end: bounds.p_today_end,
        }),
        fetchTeacherWeekScheduleRows(supabase, uid, workspaceId, dayStart, dayEnd),
      ])
      if (!ok) return
      setGroupsListLoading(false)
      setTodayLoading(false)
      if (rpcRes.error) {
        setGroupsListErr(rpcRes.error.message)
        setGroupRows([])
      } else {
        setGroupRows(normalizeTeacherGroupSummaryRows(rpcRes.data))
      }
      if (schedRes.error) {
        setTodayErr(schedRes.error)
        setTodayRows([])
      } else {
        setTodayRows(schedRes.rows)
      }
    })()
    return () => {
      ok = false
    }
  }, [session?.user?.id, workspaceId])

  useEffect(() => {
    if (annGroupId && !groupRows.some((r) => r.group_id === annGroupId)) {
      setAnnGroupId(groupRows[0]?.group_id ?? '')
    }
    if (postGroupId && !groupRows.some((r) => r.group_id === postGroupId)) {
      setPostGroupId(groupRows[0]?.group_id ?? '')
    }
  }, [groupRows, annGroupId, postGroupId])

  useEffect(() => {
    if (expandedQuick === 'announce') {
      setAnnErr(null)
      setAnnOk(null)
      setAnnGroupId((id) => id || groupRows[0]?.group_id || '')
    }
    if (expandedQuick === 'post') {
      setPostErr(null)
      setPostOk(null)
      setPostGroupId((id) => id || groupRows[0]?.group_id || '')
    }
  }, [expandedQuick, groupRows])

  const submitQuickPost = useCallback(
    async (
      kind: 'announce' | 'post',
      audience: 'workspace' | 'group',
      groupId: string,
      title: string,
      content: string,
      setSaving: (v: boolean) => void,
      setLocalErr: (v: string | null) => void,
      setLocalOk: (v: string | null) => void,
      clearFields: () => void,
    ) => {
      const uid = session?.user?.id
      if (!uid || !workspaceId) {
        setLocalErr('لا مساحة للأستاذ')
        return
      }
      const trimmed = content.trim()
      if (!trimmed) {
        setLocalErr('أدخل نص الإعلان أو المنشور')
        return
      }
      if (audience === 'group' && !groupId) {
        setLocalErr('اختر فوجاً')
        return
      }
      setSaving(true)
      setLocalErr(null)
      setLocalOk(null)
      try {
        let wsId = workspaceId
        if (audience === 'group') {
          const { data: g, error: ge } = await supabase
            .from('groups')
            .select('workspace_id')
            .eq('id', groupId)
            .single()
          if (ge || !g) {
            setLocalErr(ge?.message ?? 'تعذر تحميل بيانات الفوج')
            return
          }
          wsId = g.workspace_id as string
        }
        const row = {
          workspace_id: wsId,
          group_id: audience === 'group' ? groupId : null,
          author_id: uid,
          scope: audience,
          title: title.trim() || null,
          content: trimmed,
          post_type: kind === 'announce' ? 'announcement' : 'general',
          is_public_on_site: audience === 'workspace',
        }
        const { error } = await supabase.from('posts').insert(row)
        if (error) {
          setLocalErr(error.message)
          return
        }
        clearFields()
        setLocalOk(kind === 'announce' ? 'تم نشر الإعلان.' : 'تم نشر المنشور.')
      } finally {
        setSaving(false)
      }
    },
    [session?.user?.id, workspaceId],
  )

  if (!session?.user?.id) return <Loading />

  const scheduleTo =
    firstGroupId != null ? `/t/groups/${firstGroupId}#group-schedule` : '/t/groups'

  function toggleQuick(kind: 'announce' | 'post') {
    setExpandedQuick((prev) => (prev === kind ? null : kind))
  }

  return (
    <div className="page">
      <ErrorBanner message={err} />

      {!profile ? (
        <Loading label="جاري التحميل…" />
      ) : (
        <>
          <section className="section teacher-home__quick-section" aria-labelledby="teacher-home-quick-h">
            <h2 id="teacher-home-quick-h" className="teacher-home__quick-title">
              إضافة
            </h2>
            <div className="teacher-home__quick-grid">
              <div
                className={`teacher-home__quick-card-wrap${expandedQuick === 'announce' ? ' is-expanded' : ''}`}
              >
                <button
                  type="button"
                  className={`teacher-home__quick-card${expandedQuick === 'announce' ? ' is-active' : ''}`}
                  aria-expanded={expandedQuick === 'announce'}
                  onClick={() => toggleQuick('announce')}
                >
                  <span className="teacher-home__quick-card-title">+ إعلان</span>
                  <span className="teacher-home__quick-card-desc muted">
                    لكل الطلبة أو فوج محدد — اضغط لإظهار الخانات
                  </span>
                </button>
                {expandedQuick === 'announce' && workspaceId ? (
                  <div className="teacher-home__quick-panel">
                    {groupsListLoading ? (
                      <p className="muted small">جاري تحميل الأفواج…</p>
                    ) : groupRows.length === 0 ? (
                      <p className="muted small">
                        لا توجد أفواج. أنشئ فوجاً من{' '}
                        <Link to="/t/groups">إدارة الأفواج</Link>.
                      </p>
                    ) : (
                      <form
                        className="form"
                        onSubmit={(e) => {
                          e.preventDefault()
                          void submitQuickPost(
                            'announce',
                            annAudience,
                            annGroupId,
                            annTitle,
                            annContent,
                            setAnnSaving,
                            setAnnErr,
                            setAnnOk,
                            () => {
                              setAnnTitle('')
                              setAnnContent('')
                            },
                          )
                        }}
                      >
                        <label>
                          يظهر لـ
                          <select
                            value={annAudience}
                            onChange={(e) =>
                              setAnnAudience(e.target.value === 'workspace' ? 'workspace' : 'group')
                            }
                          >
                            <option value="workspace">كل الطلبة (كل أفواج المساحة)</option>
                            <option value="group">فوج محدد</option>
                          </select>
                        </label>
                        {annAudience === 'group' ? (
                          <label>
                            الفوج
                            <select
                              value={annGroupId}
                              onChange={(e) => setAnnGroupId(e.target.value)}
                              required
                            >
                              {groupRows.map((r) => (
                                <option key={r.group_id} value={r.group_id}>
                                  {r.group_name}
                                </option>
                              ))}
                            </select>
                          </label>
                        ) : null}
                        <label>
                          عنوان (اختياري)
                          <input
                            value={annTitle}
                            onChange={(e) => setAnnTitle(e.target.value)}
                            maxLength={200}
                          />
                        </label>
                        <label>
                          نص الإعلان
                          <textarea
                            rows={4}
                            value={annContent}
                            onChange={(e) => setAnnContent(e.target.value)}
                            required
                          />
                        </label>
                        {annErr ? <p className="field-hint" style={{ color: 'var(--color-danger, #b91c1c)' }}>{annErr}</p> : null}
                        {annOk ? <p className="field-hint muted">{annOk}</p> : null}
                        <div className="teacher-home__quick-panel-actions">
                          <button type="submit" className="btn btn--primary" disabled={annSaving}>
                            {annSaving ? 'جاري النشر…' : 'نشر الإعلان'}
                          </button>
                          <button
                            type="button"
                            className="btn btn--ghost"
                            onClick={() => setExpandedQuick(null)}
                          >
                            إغلاق
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                ) : expandedQuick === 'announce' && !workspaceId ? (
                  <div className="teacher-home__quick-panel">
                    <p className="muted small">لا تتوفر مساحة أستاذ. أكمل إعداد الحساب ثم أعد المحاولة.</p>
                  </div>
                ) : null}
              </div>

              <div className={`teacher-home__quick-card-wrap${expandedQuick === 'post' ? ' is-expanded' : ''}`}>
                <button
                  type="button"
                  className={`teacher-home__quick-card${expandedQuick === 'post' ? ' is-active' : ''}`}
                  aria-expanded={expandedQuick === 'post'}
                  onClick={() => toggleQuick('post')}
                >
                  <span className="teacher-home__quick-card-title">+ منشور</span>
                  <span className="teacher-home__quick-card-desc muted">
                    لكل الطلبة أو فوج محدد — اضغط لإظهار الخانات
                  </span>
                </button>
                {expandedQuick === 'post' && workspaceId ? (
                  <div className="teacher-home__quick-panel">
                    {groupsListLoading ? (
                      <p className="muted small">جاري تحميل الأفواج…</p>
                    ) : groupRows.length === 0 ? (
                      <p className="muted small">
                        لا توجد أفواج. أنشئ فوجاً من{' '}
                        <Link to="/t/groups">إدارة الأفواج</Link>.
                      </p>
                    ) : (
                      <form
                        className="form"
                        onSubmit={(e) => {
                          e.preventDefault()
                          void submitQuickPost(
                            'post',
                            postAudience,
                            postGroupId,
                            postTitle,
                            postContent,
                            setPostSaving,
                            setPostErr,
                            setPostOk,
                            () => {
                              setPostTitle('')
                              setPostContent('')
                            },
                          )
                        }}
                      >
                        <label>
                          يظهر لـ
                          <select
                            value={postAudience}
                            onChange={(e) =>
                              setPostAudience(e.target.value === 'workspace' ? 'workspace' : 'group')
                            }
                          >
                            <option value="workspace">كل الطلبة (كل أفواج المساحة)</option>
                            <option value="group">فوج محدد</option>
                          </select>
                        </label>
                        {postAudience === 'group' ? (
                          <label>
                            الفوج
                            <select
                              value={postGroupId}
                              onChange={(e) => setPostGroupId(e.target.value)}
                              required
                            >
                              {groupRows.map((r) => (
                                <option key={r.group_id} value={r.group_id}>
                                  {r.group_name}
                                </option>
                              ))}
                            </select>
                          </label>
                        ) : null}
                        <label>
                          عنوان (اختياري)
                          <input
                            value={postTitle}
                            onChange={(e) => setPostTitle(e.target.value)}
                            maxLength={200}
                          />
                        </label>
                        <label>
                          نص المنشور
                          <textarea
                            rows={4}
                            value={postContent}
                            onChange={(e) => setPostContent(e.target.value)}
                            required
                          />
                        </label>
                        {postErr ? (
                          <p className="field-hint" style={{ color: 'var(--color-danger, #b91c1c)' }}>
                            {postErr}
                          </p>
                        ) : null}
                        {postOk ? <p className="field-hint muted">{postOk}</p> : null}
                        <div className="teacher-home__quick-panel-actions">
                          <button type="submit" className="btn btn--primary" disabled={postSaving}>
                            {postSaving ? 'جاري النشر…' : 'نشر المنشور'}
                          </button>
                          <button
                            type="button"
                            className="btn btn--ghost"
                            onClick={() => setExpandedQuick(null)}
                          >
                            إغلاق
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                ) : expandedQuick === 'post' && !workspaceId ? (
                  <div className="teacher-home__quick-panel">
                    <p className="muted small">لا تتوفر مساحة أستاذ. أكمل إعداد الحساب ثم أعد المحاولة.</p>
                  </div>
                ) : null}
              </div>
              <Link className="teacher-home__quick-card" to="/t/books#library-add-book">
                <span className="teacher-home__quick-card-title">+ رفع كتاب</span>
                <span className="teacher-home__quick-card-desc muted">المكتبة</span>
              </Link>
              <Link className="teacher-home__quick-card" to="/t/books#library-add-lesson-scientific">
                <span className="teacher-home__quick-card-title">+ مادة علمية</span>
                <span className="teacher-home__quick-card-desc muted">درس أو ملف</span>
              </Link>
              <Link
                className="teacher-home__quick-card"
                to={scheduleTo}
                title={firstGroupId == null ? 'أنشئ فوجاً أولاً' : undefined}
              >
                <span className="teacher-home__quick-card-title">+ إضافة حصة</span>
                <span className="teacher-home__quick-card-desc muted">جدولة في فوج</span>
              </Link>
            </div>
          </section>

          {workspaceId ? (
            <>
              <section className="section teacher-home__groups" aria-labelledby="teacher-home-groups-h">
                <div className="teacher-home__groups-head">
                  <h2 id="teacher-home-groups-h" className="library-section__title">
                    لائحة الأفواج
                  </h2>
                  <Link to="/t/groups" className="btn btn--ghost btn--small">
                    إدارة الأفواج
                  </Link>
                </div>
                <ErrorBanner message={groupsListErr} />
                {groupsListLoading ? (
                  <Loading label="جاري تحميل الأفواج…" />
                ) : groupRows.length === 0 ? (
                  <p className="muted">لا توجد أفواج بعد. أنشئ فوجاً من «إدارة الأفواج».</p>
                ) : (
                  <>
                    {STUDY_LEVEL_BLOCKS.map(({ level, heading }) => {
                      const list = groupsByLevel.map[level]
                      if (list.length === 0) return null
                      return (
                        <div key={level} className="teacher-home__level-block">
                          <h3 className="teacher-home__level-h3">{heading}</h3>
                          {renderGroupRows(list)}
                        </div>
                      )
                    })}
                    {groupsByLevel.other.length > 0 ? (
                      <div className="teacher-home__level-block">
                        <h3 className="teacher-home__level-h3">أخرى</h3>
                        {renderGroupRows(groupsByLevel.other)}
                      </div>
                    ) : null}
                  </>
                )}
              </section>

              <section className="section teacher-home__today" aria-labelledby="teacher-home-today-h">
                <div className="teacher-home__groups-head">
                  <h2 id="teacher-home-today-h" className="library-section__title">
                    حصص اليوم
                  </h2>
                  <Link to="/t/schedule" className="btn btn--ghost btn--small">
                    جدول الأسبوع
                  </Link>
                </div>
                <ErrorBanner message={todayErr} />
                {todayLoading ? (
                  <Loading label="جاري تحميل حصص اليوم…" />
                ) : todayEvents.length === 0 ? (
                  <p className="muted">لا حصص مجدولة اليوم ({todayNow.toLocaleDateString('ar-MA')}).</p>
                ) : (
                  <ul className="schedule-list">
                    {todayEvents.map((ev) => (
                      <li key={ev.id} className="schedule-list__item">
                        <Link
                          to={`/t/groups/${ev.group_id}?event=${encodeURIComponent(ev.id)}`}
                          className="teacher-home__today-link"
                        >
                          <strong>
                            {ev.subject_name ?? (ev.event_type === 'seminar' ? 'ندوة' : 'حصة')}
                          </strong>
                          {' — '}
                          {ev.groups?.group_name ? (
                            <span className="muted">«{ev.groups.group_name}»</span>
                          ) : null}
                          {' — '}
                          {scheduleEventCreatorLabel(ev)} —{' '}
                          {new Date(ev.starts_at).toLocaleTimeString('ar-MA', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}{' '}
                          →{' '}
                          {new Date(ev.ends_at).toLocaleTimeString('ar-MA', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}{' '}
                          <span className="muted">({ev.mode === 'online' ? 'عن بُعد' : 'حضوري'})</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="section teacher-home__coord-inbox" aria-labelledby="teacher-home-coord-h">
                <h2 id="teacher-home-coord-h" className="library-section__title">
                  رسائل المنسقين (غير المقروءة)
                </h2>
                <p className="muted small teacher-home__coord-inbox-hint">
                  افتح <Link to="/t/inbox">صندوق المحادثات</Link> للرد على المنسقين.
                </p>
                {coordinatorUnreadRows.length === 0 ? (
                  <p className="muted">لا رسائل منسقين غير مقروءة.</p>
                ) : (
                  <ul className="teacher-home__coord-inbox-list">
                    {coordinatorUnreadRows.map((r) => (
                      <li key={r.group_id} className="teacher-home__coord-inbox-item">
                        <Link to="/t/inbox" className="teacher-home__coord-inbox-link">
                          <span className="teacher-home__coord-inbox-group">{r.group_name}</span>
                          <span className="teacher-home__coord-msg-badge" title="غير مقروء">
                            {r.unread_coordinator_count > 99 ? '99+' : r.unread_coordinator_count}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          ) : null}
        </>
      )}
    </div>
  )
}
