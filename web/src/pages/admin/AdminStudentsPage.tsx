import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { Loading } from '../../components/Loading'
import { ErrorBanner } from '../../components/ErrorBanner'
import { EmptyState } from '../../components/EmptyState'
import { PageHeader } from '../../components/PageHeader'

type StudentRow = {
  id: string
  full_name: string
  status: string
  cohort_count: number
}

function countActiveCohortMemberships(
  members: { user_id: string; group_id: string; role_in_group: string; status: string }[],
  activeGroupIds: Set<string>,
): Map<string, number> {
  const m = new Map<string, number>()
  for (const row of members) {
    if (row.role_in_group !== 'student' || row.status !== 'active') continue
    if (!activeGroupIds.has(row.group_id)) continue
    m.set(row.user_id, (m.get(row.user_id) ?? 0) + 1)
  }
  return m
}

async function loadAdminStudents(): Promise<{ rows: StudentRow[]; error: string | null }> {
  const { data: profiles, error: pErr } = await supabase
    .from('profiles')
    .select('id, full_name, status')
    .eq('role', 'student')
    .order('full_name')

  if (pErr) return { rows: [], error: pErr.message }

  const list = profiles ?? []
  if (list.length === 0) return { rows: [], error: null }

  const { data: groups, error: gErr } = await supabase.from('groups').select('id, status')
  if (gErr) return { rows: [], error: gErr.message }

  const activeGroupIds = new Set(
    (groups as { id: string; status: string }[]).filter((g) => g.status === 'active').map((g) => g.id),
  )

  const { data: members, error: mErr } = await supabase
    .from('group_members')
    .select('user_id, group_id, role_in_group, status')
    .in(
      'user_id',
      list.map((r) => (r as { id: string }).id),
    )

  if (mErr) return { rows: [], error: mErr.message }

  const counts = countActiveCohortMemberships(
    (members as { user_id: string; group_id: string; role_in_group: string; status: string }[]) ?? [],
    activeGroupIds,
  )

  const rows: StudentRow[] = (list as { id: string; full_name: string; status: string }[]).map((p) => ({
    id: p.id,
    full_name: p.full_name?.trim() || '—',
    status: p.status,
    cohort_count: counts.get(p.id) ?? 0,
  }))

  return { rows, error: null }
}

export function AdminStudentsPage() {
  const { session } = useAuth()
  const [rows, setRows] = useState<StudentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!session?.user?.id) {
      setRows([])
      setLoading(false)
      return
    }
    setErr(null)
    setLoading(true)
    const { rows: next, error } = await loadAdminStudents()
    setRows(next)
    setErr(error)
    setLoading(false)
  }, [session?.user?.id])

  useEffect(() => {
    void reload()
  }, [reload])

  async function onSetBlocked(s: StudentRow, blocked: boolean) {
    setBusyId(s.id)
    setErr(null)
    const status = blocked ? 'blocked' : 'active'
    const { error } = await supabase.from('profiles').update({ status }).eq('id', s.id)
    setBusyId(null)
    if (error) {
      setErr(error.message)
      return
    }
    setRows((prev) => prev.map((r) => (r.id === s.id ? { ...r, status } : r)))
  }

  if (loading) return <Loading label="جاري تحميل الطلاب…" />

  return (
    <div className="page">
      <PageHeader
        title="إدارة الطلاب"
        subtitle="طلاب التطبيق (ملفات ذات دور طالب): الاسم، حالة الحساب، وعدد الأفواج النشطة التي ينتمون إليها كطلبة."
      />
      <ErrorBanner message={err} />

      <div className="admin-cohorts__toolbar">
        <div className="admin-cohorts__row-actions">
          <Link to="/admin/invitations?role=student" className="btn btn--primary">
            إرسال دعوة لطالب
          </Link>
        </div>
      </div>

      {rows.length === 0 ? (
        <section className="section">
          <EmptyState
            title="لا يوجد طلاب مسجّلون"
            hint={
              <>
                يُنشأ الطلاب عبر التسجيل أو من{' '}
                <Link to="/admin/invitations?role=student">إرسال دعوة بالبريد</Link>.
              </>
            }
          />
        </section>
      ) : (
        <section className="section">
          <div className="admin-cohorts__table-wrap" role="region" aria-label="جدول الطلاب">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>الاسم</th>
                  <th>الحالة</th>
                  <th>عدد الأفواج</th>
                  <th className="admin-table__actions">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const isBlocked = r.status === 'blocked'
                  return (
                    <tr key={r.id}>
                      <td data-label="الاسم">{r.full_name}</td>
                      <td data-label="الحالة">
                        {isBlocked ? (
                          <span className="pill">معطّل</span>
                        ) : (
                          <span className="pill pill--ok">نشط</span>
                        )}
                      </td>
                      <td data-label="عدد الأفواج">{r.cohort_count.toLocaleString('ar')}</td>
                      <td className="admin-table__actions">
                        {isBlocked ? (
                          <button
                            type="button"
                            className="btn btn--secondary btn--small"
                            disabled={busyId === r.id}
                            onClick={() => void onSetBlocked(r, false)}
                          >
                            {busyId === r.id ? '…' : 'تفعيل الحساب'}
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn btn--ghost btn--small"
                            disabled={busyId === r.id}
                            onClick={() => void onSetBlocked(r, true)}
                          >
                            {busyId === r.id ? '…' : 'تعطيل الحساب'}
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
