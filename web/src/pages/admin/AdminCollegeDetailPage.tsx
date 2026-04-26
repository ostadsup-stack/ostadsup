import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CollegeStatsGrid } from '../../components/admin-shell/AdminCollegeCard'
import { loadCollegeDashboardById, type CollegeDashboardCard } from '../../lib/adminCollegesDashboard'
import {
  loadCollegeGroupsSection,
  loadCollegeStudentsSection,
  loadCollegeTeachersSection,
  type CollegeGroupRow,
  type CollegeStudentRow,
  type CollegeTeacherRow,
} from '../../lib/adminCollegeDetail'
import { useAuth } from '../../contexts/AuthContext'
import { Loading } from '../../components/Loading'
import { ErrorBanner } from '../../components/ErrorBanner'
import { EmptyState } from '../../components/EmptyState'
import { CollegeTeachersTab } from './college-detail/CollegeTeachersTab'
import { CollegeGroupsTab } from './college-detail/CollegeGroupsTab'
import { CollegeStudentsTab } from './college-detail/CollegeStudentsTab'

type TabId = 'teachers' | 'groups' | 'students'

const TABS: { id: TabId; label: string; labelEn: string }[] = [
  { id: 'teachers', label: 'الأساتذة', labelEn: 'Teachers' },
  { id: 'groups', label: 'الأفواج', labelEn: 'Groups' },
  { id: 'students', label: 'الطلبة', labelEn: 'Students' },
]

/**
 * تفاصيل كلية — /admin/colleges/[id] — تبويبات Teachers / Groups / Students
 */
export function AdminCollegeDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { session } = useAuth()
  const [card, setCard] = useState<CollegeDashboardCard | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [tab, setTab] = useState<TabId>('teachers')
  const [teachers, setTeachers] = useState<CollegeTeacherRow[]>([])
  const [groups, setGroups] = useState<CollegeGroupRow[]>([])
  const [students, setStudents] = useState<CollegeStudentRow[]>([])
  const [loadingTabs, setLoadingTabs] = useState(false)
  const [tabsErr, setTabsErr] = useState<string | null>(null)

  const loadHeader = useCallback(async () => {
    if (!session?.user?.id || !id) {
      setCard(null)
      setLoading(false)
      return
    }
    setErr(null)
    setLoading(true)
    const { card: next, error } = await loadCollegeDashboardById(id)
    setCard(next)
    setErr(error)
    setLoading(false)
  }, [session?.user?.id, id])

  const loadTabs = useCallback(async () => {
    if (!id) return
    setTabsErr(null)
    setLoadingTabs(true)
    const [t, g, s] = await Promise.all([
      loadCollegeTeachersSection(id),
      loadCollegeGroupsSection(id),
      loadCollegeStudentsSection(id),
    ])
    setLoadingTabs(false)
    if (t.error) setTabsErr(t.error)
    else if (g.error) setTabsErr(g.error)
    else if (s.error) setTabsErr(s.error)
    setTeachers(t.rows)
    setGroups(g.rows)
    setStudents(s.rows)
  }, [id])

  useEffect(() => {
    void loadHeader()
  }, [loadHeader])

  useEffect(() => {
    if (!id || loading || err || !card) return
    void loadTabs()
  }, [id, loading, err, card, loadTabs])

  if (!id) {
    return (
      <div className="mx-auto max-w-6xl">
        <EmptyState title="معرّف غير صالح" hint={<Link to="/admin/dashboard">العودة إلى لوحة التحكم</Link>} />
      </div>
    )
  }

  if (loading) {
    return <Loading label="جاري تحميل الكلية…" />
  }

  if (err) {
    return (
      <div className="mx-auto max-w-6xl space-y-4">
        <ErrorBanner message={err} />
        <Link
          to="/admin/dashboard"
          className="inline-flex text-sm font-medium text-sky-600 underline-offset-2 hover:underline dark:text-sky-400"
        >
          العودة إلى لوحة التحكم
        </Link>
      </div>
    )
  }

  if (!card) {
    return (
      <div className="mx-auto max-w-6xl">
        <EmptyState
          title="الكلية غير موجودة"
          hint={<Link to="/admin/dashboard">العودة إلى لوحة التحكم</Link>}
        />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <nav className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-500 dark:text-slate-400">
          <Link to="/admin/dashboard" className="font-medium text-sky-600 hover:underline dark:text-sky-400">
            لوحة التحكم
          </Link>
          {card.universityId && card.universityName ? (
            <>
              <span aria-hidden>/</span>
              <Link
                to={`/admin/universities/${card.universityId}`}
                className="font-medium text-sky-600 hover:underline dark:text-sky-400"
              >
                {card.universityName}
              </Link>
            </>
          ) : null}
          <span aria-hidden>/</span>
          <span className="font-medium text-slate-800 dark:text-slate-200">{card.name}</span>
        </nav>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-50 sm:text-4xl">
          {card.name}
        </h1>
        {card.description ? (
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-600 dark:text-slate-400">{card.description}</p>
        ) : null}
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          تبويبات: الأساتذة، الأفواج، والطلبة — جداول تفصيلية لكل قسم.
        </p>
      </div>

      <section
        aria-label="إحصاءات الكلية"
        className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-700/80 dark:bg-[#111827]"
      >
        <CollegeStatsGrid
          teacherCount={card.teacherCount}
          groupCount={card.groupCount}
          studentCount={card.studentCount}
          size="page"
        />
      </section>

      <section aria-label="أقسام الكلية" className="space-y-4">
        <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-1 dark:border-slate-700">
          {TABS.map((t) => {
            const on = tab === t.id
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={[
                  'rounded-t-xl px-4 py-2.5 text-sm font-medium transition',
                  on
                    ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/90 dark:bg-slate-800 dark:text-slate-50 dark:ring-slate-600'
                    : 'text-slate-500 hover:bg-slate-100/80 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800/50 dark:hover:text-slate-200',
                ].join(' ')}
              >
                <span className="block">{t.label}</span>
                <span className="mt-0.5 block text-[10px] font-normal uppercase tracking-wide text-slate-400 dark:text-slate-500">
                  {t.labelEn}
                </span>
              </button>
            )
          })}
        </div>

        {tabsErr ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100">
            {tabsErr}{' '}
            <button type="button" className="font-semibold underline" onClick={() => void loadTabs()}>
              إعادة المحاولة
            </button>
          </div>
        ) : null}

        {loadingTabs ? (
          <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">جاري تحميل الجداول…</p>
        ) : tab === 'teachers' ? (
          <CollegeTeachersTab rows={teachers} />
        ) : tab === 'groups' ? (
          <CollegeGroupsTab collegeId={id} collegeName={card.name} rows={groups} onReload={() => void loadTabs()} />
        ) : (
          <CollegeStudentsTab rows={students} />
        )}
      </section>
    </div>
  )
}
