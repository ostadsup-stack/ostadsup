import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AdminCollegeCard } from '../../components/admin-shell/AdminCollegeCard'
import { loadCollegesForUniversity, loadUniversityById, type CollegeSummaryForUniversity } from '../../lib/adminUniversitiesDashboard'
import { useAuth } from '../../contexts/AuthContext'
import { Loading } from '../../components/Loading'
import { ErrorBanner } from '../../components/ErrorBanner'
import { EmptyState } from '../../components/EmptyState'
import { CreateCollegeModal } from './CreateCollegeModal'

/**
 * صفحة جامعة — الكليات داخلها + إنشاء كلية (اسم + تعريف)
 */
export function AdminUniversityDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { session } = useAuth()
  const [uni, setUni] = useState<{ id: string; name: string; description: string | null } | null>(null)
  const [colleges, setColleges] = useState<CollegeSummaryForUniversity[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [collegeModalOpen, setCollegeModalOpen] = useState(false)

  const load = useCallback(async () => {
    if (!session?.user?.id || !id) {
      setUni(null)
      setColleges([])
      setLoading(false)
      return
    }
    setErr(null)
    setLoading(true)
    const { row, error: uErr } = await loadUniversityById(id)
    if (uErr) {
      setUni(null)
      setColleges([])
      setErr(uErr)
      setLoading(false)
      return
    }
    if (!row) {
      setUni(null)
      setColleges([])
      setErr('الجامعة غير موجودة.')
      setLoading(false)
      return
    }
    const { rows, error: cErr } = await loadCollegesForUniversity(id)
    setUni(row)
    setColleges(rows)
    setErr(cErr)
    setLoading(false)
  }, [session?.user?.id, id])

  useEffect(() => {
    void load()
  }, [load])

  if (!id) {
    return (
      <div className="mx-auto max-w-6xl">
        <EmptyState title="معرّف غير صالح" hint={<Link to="/admin/dashboard">العودة إلى لوحة التحكم</Link>} />
      </div>
    )
  }

  if (loading) {
    return <Loading label="جاري تحميل الجامعة…" />
  }

  if (err || !uni) {
    return (
      <div className="mx-auto max-w-6xl space-y-4">
        {err ? <ErrorBanner message={err} /> : null}
        <Link to="/admin/dashboard" className="text-sm font-medium text-sky-600 underline-offset-2 hover:underline dark:text-sky-400">
          ← لوحة التحكم
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <Link
          to="/admin/dashboard"
          className="text-sm font-medium text-sky-600 underline-offset-2 hover:underline dark:text-sky-400"
        >
          ← لوحة التحكم
        </Link>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-50 sm:text-4xl">{uni.name}</h1>
        {uni.description ? (
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-600 dark:text-slate-400">{uni.description}</p>
        ) : (
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">لا يوجد تعريف للجامعة — يمكن تحديثه لاحقاً من قاعدة البيانات أو واجهة لاحقة.</p>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">الكليات</h2>
        <button
          type="button"
          className="rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-sky-700 dark:bg-sky-600 dark:hover:bg-sky-500"
          onClick={() => setCollegeModalOpen(true)}
        >
          إنشاء كلية
        </button>
      </div>

      {colleges.length === 0 ? (
        <EmptyState
          title="لا توجد كليات بعد"
          hint='استخدم زر «إنشاء كلية» لإضافة كلية مع اسمها وتعريفها، ثم افتح بطاقة الكلية لإدارة الأفواج والأساتذة.'
        />
      ) : (
        <section aria-label="كليات الجامعة" className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {colleges.map((c, i) => (
            <AdminCollegeCard
              key={c.id}
              collegeId={c.id}
              name={c.name}
              subtitle={c.description}
              teacherCount={c.teacherCount}
              groupCount={c.groupCount}
              studentCount={c.studentCount}
              accentIndex={i}
            />
          ))}
        </section>
      )}

      <CreateCollegeModal
        open={collegeModalOpen}
        universityId={id}
        universityName={uni.name}
        onClose={() => setCollegeModalOpen(false)}
        onCreated={() => void load()}
      />
    </div>
  )
}
