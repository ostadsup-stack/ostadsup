import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import {
  fetchActiveStudentMemberships,
  filterStudentRoleRows,
} from '../../lib/studentGroup'
import { addDays, startOfMonday, type ScheduleWeekEventRow } from '../../lib/teacherWeekSchedule'
import { Loading } from '../../components/Loading'
import { ErrorBanner } from '../../components/ErrorBanner'
import { PageHeader } from '../../components/PageHeader'
import { EmptyState } from '../../components/EmptyState'
import { TeacherWeekScheduleGrid } from '../../components/teacher/TeacherWeekScheduleGrid'

export function StudentSchedulePage() {
  const { session } = useAuth()
  const [weekOffset, setWeekOffset] = useState(0)
  const [err, setErr] = useState<string | null>(null)
  const [rows, setRows] = useState<ScheduleWeekEventRow[]>([])
  const [loading, setLoading] = useState(true)
  const [primaryGroupId, setPrimaryGroupId] = useState<string | null>(null)
  const [groupName, setGroupName] = useState<string | null>(null)

  const reload = useCallback(async () => {
    const uid = session?.user?.id
    if (!uid) {
      setLoading(false)
      setRows([])
      setPrimaryGroupId(null)
      setGroupName(null)
      return
    }
    setLoading(true)
    setErr(null)
    const { rows: memberRows, error: mErr } = await fetchActiveStudentMemberships(supabase, uid)
    if (mErr) {
      setErr(mErr)
      setRows([])
      setPrimaryGroupId(null)
      setGroupName(null)
      setLoading(false)
      return
    }
    const students = filterStudentRoleRows(memberRows)
    const gid =
      students[0]?.group_id ??
      memberRows.find((r) => r.role_in_group === 'coordinator')?.group_id ??
      memberRows[0]?.group_id ??
      null
    const g0 = memberRows.find((r) => r.group_id === gid)?.groups
    setPrimaryGroupId(gid)
    setGroupName(g0?.group_name?.trim() ?? null)

    if (!gid) {
      setRows([])
      setLoading(false)
      return
    }

    const weekStart = addDays(startOfMonday(new Date()), weekOffset * 7)
    const weekEnd = addDays(weekStart, 6)
    weekEnd.setHours(23, 59, 59, 999)

    const { data, error } = await supabase
      .from('schedule_events')
      .select(
        '*, groups(group_name, accent_color), profiles:profiles!schedule_events_created_by_fkey(full_name)',
      )
      .eq('group_id', gid)
      .neq('status', 'cancelled')
      .gte('starts_at', weekStart.toISOString())
      .lte('starts_at', weekEnd.toISOString())
      .order('starts_at', { ascending: true })

    setLoading(false)
    if (error) {
      setErr(error.message)
      setRows([])
      return
    }
    setErr(null)
    setRows((data as ScheduleWeekEventRow[]) ?? [])
  }, [session?.user?.id, weekOffset])

  useEffect(() => {
    void reload()
  }, [reload])

  if (!session?.user?.id) return <Loading />

  if (!primaryGroupId) {
    return (
      <div className="page">
        <PageHeader title="جدول الحصص" subtitle="بعد انضمامك لفوج يظهر جدول الحصص هنا." />
        <EmptyState
          title="لم تنضم لفوج بعد"
          hint={
            <>
              استخدم <Link to="/s/join">صفحة الانضمام</Link> مع كود الأستاذ.
            </>
          }
        />
      </div>
    )
  }

  return (
    <div className="page">
      <PageHeader
        title="جدول الحصص"
        subtitle={
          groupName
            ? `أسبوع كامل لفوج «${groupName}» (8:00–22:00 بتوقيت جهازك).`
            : 'أسبوع كامل بتوقيت جهازك.'
        }
      />
      <ErrorBanner message={err} />
      <TeacherWeekScheduleGrid
        rows={rows}
        weekOffset={weekOffset}
        onWeekOffsetChange={setWeekOffset}
        loading={loading}
        buildEventLink={() => '/s/schedule'}
        emptyStateTitle="لا حصص في هذا الأسبوع"
        emptyHint="عند جدولة حصص من الأستاذ ستظهر هنا. جرّب الأسبوع السابق أو التالي."
      />
    </div>
  )
}
