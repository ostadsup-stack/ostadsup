import type { CollegeStudentRow } from '../../../lib/adminCollegeDetail'
import { EmptyState } from '../../../components/EmptyState'

export function CollegeStudentsTab({ rows }: { rows: CollegeStudentRow[] }) {
  if (rows.length === 0) {
    return <EmptyState title="لا يوجد طلاب في أفواج هذه الكلية" hint="يظهر الطلاب عند وجود عضويات نشطة في الأفواج المرتبطة بالكلية." />
  }

  return (
    <div className="admin-cohorts__table-wrap overflow-x-auto rounded-2xl border border-slate-200/80 dark:border-slate-700/80" role="region">
      <table className="admin-table">
        <thead>
          <tr>
            <th>الاسم</th>
            <th>عدد الأفواج</th>
            <th>الحالة</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.user_id}>
              <td data-label="الاسم">{r.full_name}</td>
              <td data-label="عدد الأفواج">{r.group_count.toLocaleString('ar')}</td>
              <td data-label="الحالة">
                {r.status === 'active' ? (
                  <span className="pill pill--ok">نشط</span>
                ) : r.status === 'blocked' ? (
                  <span className="pill">محظور</span>
                ) : (
                  <span className="pill">{r.status}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
