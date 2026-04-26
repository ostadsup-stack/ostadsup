import type { MockCohort, MockSignup } from './mockDashboardData'

type ActivityOverviewCardProps = {
  signups: MockSignup[]
  cohorts: MockCohort[]
}

export function ActivityOverviewCard({ signups, cohorts }: ActivityOverviewCardProps) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-700/80 dark:bg-[#111827]">
      <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">نشاط النظام</h2>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">آخر التسجيلات والأفواج (عرض تجريبي)</p>
      <div className="mt-6 grid gap-8 sm:grid-cols-2">
        <div>
          <h3 className="text-xs font-semibold tracking-wide text-slate-500 dark:text-slate-400">آخر التسجيلات</h3>
          <ul className="mt-3 space-y-3">
            {signups.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3 last:border-0 last:pb-0 dark:border-slate-700/80"
              >
                <div>
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{s.name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{s.role}</p>
                </div>
                <span className="shrink-0 text-xs text-slate-400 dark:text-slate-500">{s.at}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="text-xs font-semibold tracking-wide text-slate-500 dark:text-slate-400">آخر الأفواج</h3>
          <ul className="mt-3 space-y-3">
            {cohorts.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3 last:border-0 last:pb-0 dark:border-slate-700/80"
              >
                <div>
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{c.name}</p>
                  <p className="font-mono text-xs text-slate-500 dark:text-slate-400">{c.code}</p>
                </div>
                <span className="shrink-0 text-xs text-slate-400 dark:text-slate-500">{c.at}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
