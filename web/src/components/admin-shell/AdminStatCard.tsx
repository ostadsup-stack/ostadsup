import type { ReactNode } from 'react'

type AdminStatCardProps = {
  label: string
  value: string
  icon: ReactNode
  /** لون خلفية أيقونة هادئ */
  iconWrapClass: string
  loading?: boolean
}

export function AdminStatCard({ label, value, icon, iconWrapClass, loading }: AdminStatCardProps) {
  return (
    <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-700/80 dark:bg-[#111827]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
          <p
            className={`mt-2 text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-50 ${loading ? 'opacity-40' : ''}`}
            aria-live="polite"
          >
            {loading ? '…' : value}
          </p>
        </div>
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl shadow-sm ring-1 ring-inset ring-slate-200/70 dark:ring-slate-600/40 ${iconWrapClass}`}
          aria-hidden
        >
          {icon}
        </div>
      </div>
    </div>
  )
}
