import type { CollegeTeacherRow } from '../../../lib/adminCollegeDetail'
import { EmptyState } from '../../../components/EmptyState'

export function CollegeTeachersTab({ rows }: { rows: CollegeTeacherRow[] }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title="لا يوجد أساتذة في هذه الكلية"
        hint="أضف أساتذة في جدول teachers مع college_id، وربط profile_id لعرض عدد الأفواج من المنصة."
      />
    )
  }

  return (
    <div className="admin-cohorts__table-wrap overflow-x-auto rounded-2xl border border-slate-200/80 dark:border-slate-700/80" role="region">
      <table className="admin-table">
        <thead>
          <tr>
            <th>الاسم</th>
            <th>التخصص</th>
            <th>عدد الأفواج</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td data-label="الاسم">{r.full_name}</td>
              <td data-label="التخصص">{r.specialty ?? '—'}</td>
              <td data-label="عدد الأفواج">{r.cohort_count.toLocaleString('ar')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
