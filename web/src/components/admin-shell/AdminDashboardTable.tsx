import type { MockTableRow } from './mockDashboardData'

type AdminDashboardTableProps = {
  title: string
  rows: MockTableRow[]
}

export function AdminDashboardTable({ title, rows }: AdminDashboardTableProps) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-700/80 dark:bg-[#111827]">
      <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-700/80">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">صفوف عيّنة للعرض</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[280px] text-start text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs font-medium text-slate-500 dark:border-slate-700 dark:text-slate-400">
              <th className="px-5 py-3 font-medium">الاسم</th>
              <th className="px-5 py-3 font-medium">العدد</th>
              <th className="px-5 py-3 font-medium">الحالة</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                className="border-b border-slate-100/90 transition-colors last:border-0 hover:bg-slate-50/90 dark:border-slate-800 dark:hover:bg-slate-800/50"
              >
                <td className="px-5 py-3.5 font-medium text-slate-800 dark:text-slate-200">{r.name}</td>
                <td className="px-5 py-3.5 tabular-nums text-slate-600 dark:text-slate-300">{r.count}</td>
                <td className="px-5 py-3.5">
                  <span
                    className={
                      r.status === 'نشط'
                        ? 'inline-flex rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400'
                        : 'inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                    }
                  >
                    {r.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
