import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { IconBook, IconGraduation, IconLandmark, IconLayout, IconUsers } from '../NavIcons'

const ACCENTS = [
  'from-white via-indigo-50/50 to-slate-50/90 ring-indigo-100/60 dark:from-[#111827] dark:via-indigo-950/20 dark:to-slate-950/40 dark:ring-indigo-900/30',
  'from-white via-sky-50/50 to-slate-50/90 ring-sky-100/60 dark:from-[#111827] dark:via-sky-950/20 dark:to-slate-950/40 dark:ring-sky-900/30',
  'from-white via-emerald-50/45 to-slate-50/90 ring-emerald-100/60 dark:from-[#111827] dark:via-emerald-950/20 dark:to-slate-950/40 dark:ring-emerald-900/30',
  'from-white via-rose-50/40 to-slate-50/90 ring-rose-100/60 dark:from-[#111827] dark:via-rose-950/15 dark:to-slate-950/40 dark:ring-rose-900/25',
] as const

type StatProps = { label: string; value: string; icon: ReactNode }

function MiniStat({ label, value, icon }: StatProps) {
  return (
    <div className="flex flex-col items-center rounded-xl bg-white/75 px-2 py-3 text-center ring-1 ring-slate-200/70 dark:bg-slate-900/50 dark:ring-slate-700/60">
      <span className="text-slate-500 dark:text-slate-400" aria-hidden>
        {icon}
      </span>
      <span className="mt-1 text-xl font-semibold tabular-nums text-slate-900 dark:text-slate-50">{value}</span>
      <span className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </span>
    </div>
  )
}

type AdminUniversityCardProps = {
  universityId: string
  name: string
  description: string | null
  collegeCount: number
  teacherCount: number
  groupCount: number
  studentCount: number
  accentIndex?: number
}

/**
 * بطاقة جامعة — الانتقال إلى صفحة الكليات داخلها
 */
export function AdminUniversityCard({
  universityId,
  name,
  description,
  collegeCount,
  teacherCount,
  groupCount,
  studentCount,
  accentIndex = 0,
}: AdminUniversityCardProps) {
  const accent = ACCENTS[accentIndex % ACCENTS.length]
  const to = `/admin/universities/${universityId}`
  const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 0 })

  return (
    <Link
      to={to}
      className={`group flex h-full flex-col rounded-2xl border border-slate-200/80 bg-gradient-to-br p-6 shadow-md ring-1 ring-inset transition hover:-translate-y-0.5 hover:shadow-lg hover:ring-slate-300/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:border-slate-700/80 dark:hover:ring-slate-600/40 dark:focus-visible:outline-indigo-400 ${accent}`}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/90 text-slate-700 shadow-sm ring-1 ring-slate-200/80 dark:bg-slate-800/90 dark:text-slate-200 dark:ring-slate-600/50">
          <IconLandmark className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1 text-right">
          <h2 className="text-lg font-semibold leading-snug tracking-tight text-slate-900 dark:text-slate-50 sm:text-xl">
            <span className="group-hover:text-indigo-700 dark:group-hover:text-indigo-300">{name}</span>
          </h2>
          {description ? (
            <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-slate-600 dark:text-slate-400">{description}</p>
          ) : (
            <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">لا يوجد تعريف للجامعة بعد — يمكن إضافته من صفحة الجامعة.</p>
          )}
        </div>
      </div>
      <p className="mt-3 text-center text-xs text-slate-400 dark:text-slate-500">اضغط لإدارة الكليات داخل الجامعة</p>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4" dir="ltr">
        <MiniStat label="Colleges" value={fmt(collegeCount)} icon={<IconLayout className="mx-auto h-4 w-4" />} />
        <MiniStat label="Teachers" value={fmt(teacherCount)} icon={<IconUsers className="mx-auto h-4 w-4" />} />
        <MiniStat label="Groups" value={fmt(groupCount)} icon={<IconBook className="mx-auto h-4 w-4" />} />
        <MiniStat label="Students" value={fmt(studentCount)} icon={<IconGraduation className="mx-auto h-4 w-4" />} />
      </div>
    </Link>
  )
}
