import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { IconBook, IconGraduation, IconUsers } from '../NavIcons'

const ACCENTS = [
  'from-white via-sky-50/50 to-slate-50/90 ring-sky-100/60 dark:from-[#111827] dark:via-sky-950/20 dark:to-slate-950/40 dark:ring-sky-900/30',
  'from-white via-violet-50/50 to-slate-50/90 ring-violet-100/60 dark:from-[#111827] dark:via-violet-950/20 dark:to-slate-950/40 dark:ring-violet-900/30',
  'from-white via-teal-50/45 to-slate-50/90 ring-teal-100/60 dark:from-[#111827] dark:via-teal-950/20 dark:to-slate-950/40 dark:ring-teal-900/30',
  'from-white via-amber-50/40 to-slate-50/90 ring-amber-100/60 dark:from-[#111827] dark:via-amber-950/15 dark:to-slate-950/40 dark:ring-amber-900/25',
] as const

type CollegeStatsGridProps = {
  teacherCount: number
  groupCount: number
  studentCount: number
  loading?: boolean
  /** أرقام أكبر في صفحة التفاصيل */
  size?: 'card' | 'page'
}

/**
 * شبكة إحصاءات: Teachers / Groups / Students مع أيقونات وأرقام بارزة.
 */
export function CollegeStatsGrid({
  teacherCount,
  groupCount,
  studentCount,
  loading,
  size = 'card',
}: CollegeStatsGridProps) {
  const fmt = (n: number) =>
    loading ? '…' : n.toLocaleString('en-US', { maximumFractionDigits: 0 })

  const numClass =
    size === 'page'
      ? 'text-4xl font-semibold tracking-tight sm:text-5xl'
      : 'text-3xl font-semibold tracking-tight sm:text-[2rem]'

  const iconWrap =
    size === 'page'
      ? 'flex h-12 w-12 items-center justify-center rounded-2xl'
      : 'flex h-10 w-10 items-center justify-center rounded-xl'

  const items: { label: string; value: number; icon: ReactNode; wrap: string }[] = [
    {
      label: 'Teachers',
      value: teacherCount,
      icon: <IconUsers className={size === 'page' ? 'h-6 w-6' : 'h-5 w-5'} />,
      wrap: 'bg-sky-50 text-sky-600 ring-sky-100/80 dark:bg-sky-950/40 dark:text-sky-300 dark:ring-sky-800/40',
    },
    {
      label: 'Groups',
      value: groupCount,
      icon: <IconBook className={size === 'page' ? 'h-6 w-6' : 'h-5 w-5'} />,
      wrap: 'bg-violet-50 text-violet-600 ring-violet-100/80 dark:bg-violet-950/35 dark:text-violet-300 dark:ring-violet-800/40',
    },
    {
      label: 'Students',
      value: studentCount,
      icon: <IconGraduation className={size === 'page' ? 'h-6 w-6' : 'h-5 w-5'} />,
      wrap: 'bg-teal-50 text-teal-600 ring-teal-100/80 dark:bg-teal-950/35 dark:text-teal-300 dark:ring-teal-800/40',
    },
  ]

  return (
    <div
      className="grid grid-cols-3 gap-3 sm:gap-4"
      dir="ltr"
      aria-label="College statistics"
    >
      {items.map(({ label, value, icon, wrap }) => (
        <div
          key={label}
          className="flex flex-col items-center gap-2 rounded-xl bg-white/70 px-2 py-4 text-center shadow-sm ring-1 ring-slate-200/60 dark:bg-slate-900/50 dark:ring-slate-700/50 sm:px-3"
        >
          <span
            className={`${iconWrap} shrink-0 ring-1 ring-inset ${wrap}`}
            aria-hidden
          >
            {icon}
          </span>
          <span className={`tabular-nums text-slate-900 dark:text-slate-50 ${numClass}`}>
            {fmt(value)}
          </span>
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {label}
          </span>
        </div>
      ))}
    </div>
  )
}

type AdminCollegeCardProps = {
  collegeId: string
  name: string
  /** تعريف مختصر تحت اسم الكلية */
  subtitle?: string | null
  teacherCount: number
  groupCount: number
  studentCount: number
  loading?: boolean
  accentIndex?: number
}

/**
 * بطاقة كلية — ضغط للانتقال إلى /admin/colleges/[id]
 */
export function AdminCollegeCard({
  collegeId,
  name,
  subtitle,
  teacherCount,
  groupCount,
  studentCount,
  loading,
  accentIndex = 0,
}: AdminCollegeCardProps) {
  const accent = ACCENTS[accentIndex % ACCENTS.length]
  const to = `/admin/colleges/${collegeId}`

  return (
    <Link
      to={to}
      className={`group flex h-full flex-col rounded-2xl border border-slate-200/80 bg-gradient-to-br p-6 shadow-md ring-1 ring-inset transition hover:-translate-y-0.5 hover:shadow-lg hover:ring-slate-300/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 dark:border-slate-700/80 dark:hover:ring-slate-600/40 dark:focus-visible:outline-sky-400 ${accent}`}
    >
      <h2 className="text-center text-xl font-semibold leading-snug tracking-tight text-slate-900 dark:text-slate-50 sm:text-2xl">
        <span className="group-hover:text-sky-700 dark:group-hover:text-sky-300">{name}</span>
      </h2>
      {subtitle ? (
        <p className="mt-2 line-clamp-3 text-center text-xs leading-relaxed text-slate-600 dark:text-slate-400">
          {subtitle}
        </p>
      ) : null}
      <p className={`text-center text-xs text-slate-400 dark:text-slate-500 ${subtitle ? 'mt-1' : 'mt-2'}`}>
        اضغط للتفاصيل
      </p>
      <div className="mt-6 flex-1">
        <CollegeStatsGrid
          teacherCount={teacherCount}
          groupCount={groupCount}
          studentCount={studentCount}
          loading={loading}
          size="card"
        />
      </div>
    </Link>
  )
}
