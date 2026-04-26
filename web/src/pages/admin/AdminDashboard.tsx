import { useCallback, useEffect, useState } from 'react'
import { AdminUniversityCard } from '../../components/admin-shell/AdminUniversityCard'
import { AdminMessagesOverviewCard } from '../../components/admin-shell/AdminMessagesOverviewCard'
import { useAdminUniversitiesDashboard } from '../../hooks/useAdminUniversitiesDashboard'
import { useAuth } from '../../contexts/AuthContext'
import { loadAdminMessagesOverviewStats, type AdminMessagesOverviewStats } from '../../lib/adminMessagesOverview'
import { EmptyState } from '../../components/EmptyState'
import { CreateUniversityModal } from './CreateUniversityModal'

/**
 * لوحة تحكم إدارية: شبكة جامعات — إنشاء جامعة ثم إدارة الكليات من داخل صفحة الجامعة.
 */
const emptyOverview: AdminMessagesOverviewStats = {
  platformUnread: 0,
  teachers: 0,
  coordinators: 0,
  students: 0,
  error: null,
}

export function AdminDashboard() {
  const { session } = useAuth()
  const { cards, loading, error, reload } = useAdminUniversitiesDashboard(session?.user?.id)
  const [uniModalOpen, setUniModalOpen] = useState(false)
  const [msgOverview, setMsgOverview] = useState<AdminMessagesOverviewStats>(emptyOverview)
  const [msgLoading, setMsgLoading] = useState(true)

  const refreshOverview = useCallback(async () => {
    const uid = session?.user?.id
    if (!uid) {
      setMsgOverview(emptyOverview)
      setMsgLoading(false)
      return
    }
    setMsgLoading(true)
    const s = await loadAdminMessagesOverviewStats(uid)
    setMsgOverview(s)
    setMsgLoading(false)
  }, [session?.user?.id])

  useEffect(() => {
    void refreshOverview()
  }, [refreshOverview])

  useEffect(() => {
    if (!session?.user?.id) return
    const t = window.setInterval(() => void refreshOverview(), 30_000)
    return () => window.clearInterval(t)
  }, [session?.user?.id, refreshOverview])

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">لوحة التحكم</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            الجامعات أولاً: أنشئ حساب جامعة (اسم + تعريف)، ثم افتح الجامعة لإضافة كليات مع تعريف كل كلية.
          </p>
        </div>
        <button
          type="button"
          className="shrink-0 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-500"
          onClick={() => setUniModalOpen(true)}
        >
          إنشاء جامعة
        </button>
      </div>

      <AdminMessagesOverviewCard
        stats={msgOverview}
        loading={msgLoading}
        onRefresh={() => void refreshOverview()}
      />

      {error ? (
        <div className="rounded-2xl border border-amber-200/80 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
          <p>
            {error}{' '}
            <button
              type="button"
              className="font-semibold underline decoration-amber-600/60 underline-offset-2"
              onClick={() => void reload()}
            >
              إعادة المحاولة
            </button>
          </p>
        </div>
      ) : null}

      {loading && !error ? (
        <p className="rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-8 text-center text-sm text-slate-500 shadow-sm dark:border-slate-700/80 dark:bg-[#111827]/80 dark:text-slate-400">
          جاري تحميل الجامعات…
        </p>
      ) : !error && cards.length === 0 ? (
        <EmptyState
          title="لا توجد جامعات بعد"
          hint='اضغط «إنشاء جامعة» لإضافة أول مؤسسة، ثم ادخل إليها لإنشاء الكليات وتعريفها.'
        />
      ) : (
        <section aria-label="جامعات المنصة" className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {cards.map((u, i) => (
            <AdminUniversityCard
              key={u.id}
              universityId={u.id}
              name={u.name}
              description={u.description}
              collegeCount={u.collegeCount}
              teacherCount={u.teacherCount}
              groupCount={u.groupCount}
              studentCount={u.studentCount}
              accentIndex={i}
            />
          ))}
        </section>
      )}

      <CreateUniversityModal
        open={uniModalOpen}
        onClose={() => setUniModalOpen(false)}
        onCreated={() => void reload()}
      />
    </div>
  )
}
