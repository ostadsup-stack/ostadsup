import { Link } from 'react-router-dom'
import { IconMail } from '../NavIcons'
import { Loading } from '../Loading'
import type { AdminMessagesOverviewStats } from '../../lib/adminMessagesOverview'

const rowClass =
  'flex items-center justify-between gap-3 rounded-xl border border-slate-200/90 bg-white px-3 py-2.5 text-sm transition hover:border-indigo-300/80 hover:bg-indigo-50/40 dark:border-slate-700/80 dark:bg-[#111827]/50 dark:hover:border-indigo-800/50 dark:hover:bg-indigo-950/20'

type AdminMessagesOverviewCardProps = {
  stats: AdminMessagesOverviewStats
  loading: boolean
  onRefresh?: () => void
}

export function AdminMessagesOverviewCard({ stats, loading, onRefresh }: AdminMessagesOverviewCardProps) {
  const rows: {
    key: string
    label: string
    sub?: string
    to: string
    count: number
  }[] = [
    {
      key: 'admin',
      label: 'تنبيهات الإدارة والنظام',
      sub: 'الموافقات، الجدول، وإشعارات المنصة',
      to: '/admin/notifications',
      count: stats.platformUnread,
    },
    {
      key: 'teachers',
      label: 'أساتذة',
      to: '/admin/messages?filter=teachers',
      count: stats.teachers,
    },
    {
      key: 'coordinators',
      label: 'منسقون',
      sub: 'مستخدمون بدور «منسق» في فوج',
      to: '/admin/messages?filter=coordinators',
      count: stats.coordinators,
    },
    {
      key: 'students',
      label: 'طلبة',
      to: '/admin/messages?filter=students',
      count: stats.students,
    },
  ]

  return (
    <section
      className="rounded-2xl border border-slate-200/80 bg-gradient-to-b from-slate-50/90 to-white p-1 shadow-sm dark:border-slate-800 dark:from-slate-900/40 dark:to-[#0f172a]/90"
      aria-label="نظرة على الرسائل والتنبيهات"
    >
      <div className="flex flex-col gap-1 p-2 sm:p-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-200">
              <IconMail className="h-4 w-4" aria-hidden />
            </span>
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">الرسائل والتنبيهات</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">إدارة النظام، ثم أستاذ، منسق، طالب — غير المقروء</p>
            </div>
          </div>
          {onRefresh ? (
            <button
              type="button"
              className="shrink-0 text-xs font-medium text-indigo-600 underline decoration-indigo-500/30 underline-offset-2 hover:text-indigo-500 dark:text-indigo-400"
              onClick={() => onRefresh()}
            >
              تحديث
            </button>
          ) : null}
        </div>

        {stats.error ? (
          <p className="rounded-lg border border-amber-200/80 bg-amber-50/90 px-3 py-2 text-xs text-amber-900 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-100">
            {stats.error}
          </p>
        ) : null}

        {loading ? (
          <div className="py-6">
            <Loading label="جاري جلب الملخّص…" />
          </div>
        ) : (
          <ul className="mt-1 flex flex-col gap-1" role="list">
            {rows.map((r) => (
              <li key={r.key}>
                <Link to={r.to} className={rowClass} aria-label={`${r.label}: ${r.count} غير مقروء`}>
                  <div className="min-w-0 text-start">
                    <p className="font-medium text-slate-800 dark:text-slate-200">{r.label}</p>
                    {r.sub ? <p className="mt-0.5 line-clamp-1 text-xs text-slate-500 dark:text-slate-400">{r.sub}</p> : null}
                  </div>
                  {r.count > 0 ? (
                    <span className="shrink-0 rounded-full bg-rose-500/15 px-2.5 py-0.5 text-xs font-bold text-rose-700 tabular-nums dark:bg-rose-500/20 dark:text-rose-200">
                      {r.count > 99 ? '99+' : r.count}
                    </span>
                  ) : (
                    <span className="shrink-0 text-xs text-slate-400 dark:text-slate-500">0</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
