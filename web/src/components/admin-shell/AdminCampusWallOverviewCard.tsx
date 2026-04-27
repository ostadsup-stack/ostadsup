import { Link } from 'react-router-dom'
import { IconLandmark } from '../NavIcons'
import type { CampusWallStats } from '../../lib/campusWall'

type AdminCampusWallOverviewCardProps = {
  wallTitle: 'حائط الجامعة' | 'حائط الكلية'
  stats: CampusWallStats | null
  loading: boolean
  error: string | null
  onRefresh?: () => void
}

export function AdminCampusWallOverviewCard({
  wallTitle,
  stats,
  loading,
  error,
  onRefresh,
}: AdminCampusWallOverviewCardProps) {
  const s = stats ?? {
    post_count: 0,
    pending_count: 0,
    authorized_writer_count: 0,
    open_report_count: 0,
  }

  const rows = [
    { label: 'منشورات', value: s.post_count },
    { label: 'معلّقة', value: s.pending_count },
    { label: 'مصرّح بالكتابة', value: s.authorized_writer_count },
    { label: 'بلاغات مفتوحة', value: s.open_report_count },
  ]

  return (
    <section
      className="rounded-2xl border border-slate-200/80 bg-gradient-to-b from-slate-50/90 to-white p-1 shadow-sm dark:border-slate-800 dark:from-slate-900/40 dark:to-[#0f172a]/90"
      aria-label={wallTitle}
    >
      <div className="flex flex-col gap-3 p-3 sm:p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-200">
              <IconLandmark className="h-4 w-4" aria-hidden />
            </span>
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{wallTitle}</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">لوحة منشورات أكاديمية مركزية مع صلاحيات ومراجعة.</p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {onRefresh ? (
              <button
                type="button"
                className="text-xs font-medium text-indigo-600 underline decoration-indigo-500/30 underline-offset-2 hover:text-indigo-500 dark:text-indigo-400"
                onClick={() => onRefresh()}
              >
                تحديث
              </button>
            ) : null}
            <Link
              to="/admin/campus-wall"
              className="rounded-xl bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-900 dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-white"
            >
              فتح الحائط
            </Link>
          </div>
        </div>

        {error ? (
          <p className="rounded-lg border border-amber-200/80 bg-amber-50/90 px-3 py-2 text-xs text-amber-900 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-100">
            {error}
          </p>
        ) : null}

        {loading ? (
          <p className="text-center text-sm text-slate-500">جاري التحميل…</p>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {rows.map((r) => (
              <div
                key={r.label}
                className="flex flex-col items-center justify-center rounded-xl border border-slate-200/80 bg-white/90 px-2 py-3 text-center dark:border-slate-700/80 dark:bg-[#111827]/50"
              >
                <span className="text-xl font-bold tabular-nums text-sky-700 dark:text-sky-300">{r.value}</span>
                <span className="text-xs text-slate-500 dark:text-slate-400">{r.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
