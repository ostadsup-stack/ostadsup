import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { fetchWorkspaceForTeacher } from '../../lib/workspace'
import { pickContrastingForeground } from '../../lib/colorContrast'
import {
  localTodayBoundsIso,
  mapRpcRowsToQuickGroups,
  type TeacherScheduleQuickGroup,
} from '../../lib/teacherGroups'
import {
  fetchTeacherWeekScheduleRows,
  emptyScheduleOverlapAudit,
  type ScheduleWeekEventRow,
} from '../../lib/teacherWeekSchedule'
import { Loading } from '../../components/Loading'
import { ErrorBanner } from '../../components/ErrorBanner'
import { PageHeader } from '../../components/PageHeader'
import { ScheduleOverlapBanners } from '../../components/ScheduleOverlapBanners'
import { TeacherWeekScheduleGrid } from '../../components/teacher/TeacherWeekScheduleGrid'
import { addDays, startOfMonday } from '../../lib/teacherWeekSchedule'

const DEFAULT_GROUP_ACCENT = '#2563eb'

export function TeacherSchedulePage() {
  const { session } = useAuth()
  const [weekOffset, setWeekOffset] = useState(0)
  const [err, setErr] = useState<string | null>(null)
  const [rows, setRows] = useState<ScheduleWeekEventRow[]>([])
  const [quickGroups, setQuickGroups] = useState<TeacherScheduleQuickGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [overlapAudit, setOverlapAudit] = useState(emptyScheduleOverlapAudit)

  const reload = useCallback(async () => {
    const uid = session?.user?.id
    if (!uid) {
      setLoading(false)
      setQuickGroups([])
      return
    }
    const weekStart = addDays(startOfMonday(new Date()), weekOffset * 7)
    const weekEnd = addDays(weekStart, 6)
    weekEnd.setHours(23, 59, 59, 999)

    setLoading(true)
    setErr(null)
    const { workspace, error: wErr } = await fetchWorkspaceForTeacher(uid)
    if (wErr || !workspace) {
      setErr(wErr?.message ?? 'لم يُعثر على مساحة الأستاذ')
      setRows([])
      setQuickGroups([])
      setOverlapAudit(emptyScheduleOverlapAudit)
      setLoading(false)
      return
    }
    const wsId = workspace.id as string
    const [schedRes, rpcRes] = await Promise.all([
      fetchTeacherWeekScheduleRows(supabase, uid, wsId, weekStart, weekEnd),
      supabase.rpc('teacher_group_list_summaries', localTodayBoundsIso()),
    ])
    setLoading(false)
    if (!rpcRes.error && rpcRes.data) {
      setQuickGroups(mapRpcRowsToQuickGroups(rpcRes.data))
    } else {
      setQuickGroups([])
    }
    if (schedRes.error) {
      setErr(schedRes.error)
      setRows([])
      setOverlapAudit(emptyScheduleOverlapAudit)
      return
    }
    setErr(null)
    setRows(schedRes.rows)
    setOverlapAudit(schedRes.overlapAudit)
  }, [session?.user?.id, weekOffset])

  useEffect(() => {
    void reload()
  }, [reload])

  if (!session?.user?.id) return <Loading />

  return (
    <div className="page">
      <PageHeader
        title="جدول الحصص"
        subtitle="أسبوع كامل من 8:00 إلى 22:00 بتوقيت جهازك. التعديل من صفحة كل فوج."
      />
      <ErrorBanner message={err} />

      <ScheduleOverlapBanners audit={overlapAudit} />

      {quickGroups.length > 0 ? (
        <div className="schedule-page__quick-add">
          <p className="muted small schedule-page__quick-add-title">إضافة حصة سريعة</p>
          <div className="schedule-page__quick-add-list">
            {quickGroups.map((g) => {
              const accent =
                g.accent_color && /^#[0-9A-Fa-f]{6}$/.test(g.accent_color)
                  ? g.accent_color
                  : DEFAULT_GROUP_ACCENT
              return (
                <Link
                  key={g.group_id}
                  to={`/t/groups/${g.group_id}#group-schedule`}
                  className="btn btn--small schedule-page__quick-add-btn"
                  style={{
                    background: accent,
                    color: pickContrastingForeground(accent),
                    border: 'none',
                  }}
                >
                  أضف حصة — {g.group_name}
                </Link>
              )
            })}
          </div>
        </div>
      ) : null}

      <TeacherWeekScheduleGrid
        rows={rows}
        weekOffset={weekOffset}
        onWeekOffsetChange={setWeekOffset}
        loading={loading}
        buildEventLink={(ev) => `/t/groups/${ev.group_id}?event=${encodeURIComponent(ev.id)}`}
        emptyStateTitle="لا حصص في هذا الأسبوع"
        emptyHint="أضف حصصاً من صفحة كل فوج، أو انتقل لأسبوع آخر."
      />
    </div>
  )
}
