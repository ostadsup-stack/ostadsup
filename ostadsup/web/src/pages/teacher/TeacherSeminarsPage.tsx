import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { fetchWorkspaceForTeacher } from '../../lib/workspace'
import type { ScheduleEvent } from '../../types'
import { Loading } from '../../components/Loading'
import { ErrorBanner } from '../../components/ErrorBanner'
import { PageHeader } from '../../components/PageHeader'
import { EmptyState } from '../../components/EmptyState'

type SeminarRow = ScheduleEvent & { groups: { group_name: string } | null }

export function TeacherSeminarsPage() {
  const { session } = useAuth()
  const [err, setErr] = useState<string | null>(null)
  const [rows, setRows] = useState<SeminarRow[]>([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    const uid = session?.user?.id
    if (!uid) {
      setLoading(false)
      return
    }
    setLoading(true)
    setErr(null)
    const { workspace, error: wErr } = await fetchWorkspaceForTeacher(uid)
    if (wErr || !workspace) {
      setErr(wErr?.message ?? 'لم يُعثر على مساحة الأستاذ')
      setRows([])
      setLoading(false)
      return
    }
    const wsId = workspace.id as string
    const { data, error } = await supabase
      .from('schedule_events')
      .select('*, groups(group_name)')
      .eq('workspace_id', wsId)
      .eq('created_by', uid)
      .eq('event_type', 'seminar')
      .order('starts_at', { ascending: false })
    setLoading(false)
    if (error) {
      setErr(error.message)
      setRows([])
      return
    }
    setRows((data as SeminarRow[]) ?? [])
  }, [session?.user?.id])

  useEffect(() => {
    void reload()
  }, [reload])

  if (!session?.user?.id) return <Loading />

  return (
    <div className="page">
      <p className="breadcrumb">
        <Link to="/t">الرئيسية</Link> / ندواتي
      </p>
      <PageHeader
        title="ندواتي"
        subtitle="الندوات التي أضفتها من جدول كل فوج (نوع الحدث: ندوة)."
      />
      <ErrorBanner message={err} />
      {loading ? (
        <Loading label="جاري التحميل…" />
      ) : rows.length === 0 ? (
        <EmptyState
          title="لا ندوات بعد"
          hint="من صفحة فوج → الجدول، اختر «ندوة» ثم أضف الموعد."
        />
      ) : (
        <ul className="post-list">
          {rows.map((ev) => (
            <li key={ev.id} className="post-card">
              <span className="pill pill--seminar">ندوة</span>
              <h3>{ev.subject_name ?? 'ندوة'}</h3>
              <p className="muted small">
                {ev.groups?.group_name ?? 'فوج'} ·{' '}
                <Link to={`/t/groups/${ev.group_id}`}>فتح الفوج</Link>
              </p>
              <p>
                {new Date(ev.starts_at).toLocaleString('ar-MA')} → {new Date(ev.ends_at).toLocaleString('ar-MA')}
                {' — '}
                {ev.mode === 'online' ? 'عن بُعد' : 'حضوري'}
              </p>
              {ev.meeting_link ? (
                <p>
                  <a href={ev.meeting_link} target="_blank" rel="noreferrer noopener">
                    رابط الاجتماع
                  </a>
                </p>
              ) : null}
              {ev.location ? <p className="muted">{ev.location}</p> : null}
              {ev.note ? <p className="muted">{ev.note}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
