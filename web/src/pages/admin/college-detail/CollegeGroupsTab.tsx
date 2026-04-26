import { useCallback, useState } from 'react'
import type { CollegeGroupRow } from '../../../lib/adminCollegeDetail'
import { scheduleModeLabelAr, studyTrackLabelAr } from '../../../lib/teacherGroups'
import {
  deleteCollegeGroup,
  setCollegeGroupArchived,
  studyLevelLabelAr,
} from '../../../lib/adminCollegeDetail'
import { EmptyState } from '../../../components/EmptyState'
import { CollegeGroupFormModal } from './CollegeGroupFormModal'

type CollegeGroupsTabProps = {
  collegeId: string
  collegeName: string
  rows: CollegeGroupRow[]
  onReload: () => void
}

export function CollegeGroupsTab({ collegeId, collegeName, rows, onReload }: CollegeGroupsTabProps) {
  const [createOpen, setCreateOpen] = useState(false)
  const [editRow, setEditRow] = useState<CollegeGroupRow | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const onArchive = useCallback(
    async (r: CollegeGroupRow, archived: boolean) => {
      setBusyId(r.id)
      setErr(null)
      const { error } = await setCollegeGroupArchived(r.id, archived)
      setBusyId(null)
      if (error) {
        setErr(error)
        return
      }
      onReload()
    },
    [onReload],
  )

  const onDelete = useCallback(
    async (r: CollegeGroupRow) => {
      if (!window.confirm(`حذف فوج «${r.group_name}» نهائياً؟`)) return
      setBusyId(r.id)
      setErr(null)
      const { error } = await deleteCollegeGroup(r.id)
      setBusyId(null)
      if (error) {
        setErr(error)
        return
      }
      onReload()
    },
    [onReload],
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-sky-700 dark:bg-sky-600 dark:hover:bg-sky-500"
            onClick={() => setCreateOpen(true)}
          >
            إنشاء فوج جديد
          </button>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          تعديل / تعطيل (أرشفة) / حذف لكل فوج في الجدول.
        </p>
      </div>

      {err ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
          {err}
        </p>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState title="لا توجد أفواج لهذه الكلية" hint='استخدم "إنشاء فوج جديد" أو اربط أفواجاً موجودة بـ college_id.' />
      ) : (
        <div className="admin-cohorts__table-wrap overflow-x-auto rounded-2xl border border-slate-200/80 dark:border-slate-700/80" role="region">
          <table className="admin-table">
            <thead>
              <tr>
                <th>اسم الفوج</th>
                <th>الكود</th>
                <th>عدد الطلبة</th>
                <th>الأستاذ المسؤول</th>
                <th>النوع</th>
                <th>التوقيت</th>
                <th>المسار</th>
                <th>الحالة</th>
                <th className="admin-table__actions">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const archived = r.status === 'archived'
                return (
                  <tr key={r.id}>
                    <td data-label="اسم الفوج">{r.group_name?.trim() || '—'}</td>
                    <td className="input--ltr font-mono text-sm" data-label="الكود">
                      {r.join_code}
                    </td>
                    <td data-label="عدد الطلبة">{r.student_count.toLocaleString('ar')}</td>
                    <td data-label="الأستاذ المسؤول">{r.owner_name}</td>
                    <td data-label="النوع">{studyLevelLabelAr(r.study_level)}</td>
                    <td data-label="التوقيت">{scheduleModeLabelAr(r.schedule_mode)}</td>
                    <td data-label="المسار">{studyTrackLabelAr(r.study_track)}</td>
                    <td data-label="الحالة">
                      {archived ? <span className="pill">معطّل</span> : <span className="pill pill--ok">نشط</span>}
                    </td>
                    <td className="admin-table__actions">
                      <div className="admin-cohorts__row-actions flex flex-wrap gap-1">
                        <button
                          type="button"
                          className="btn btn--secondary btn--small"
                          disabled={busyId === r.id}
                          onClick={() => setEditRow(r)}
                        >
                          تعديل
                        </button>
                        {archived ? (
                          <button
                            type="button"
                            className="btn btn--secondary btn--small"
                            disabled={busyId === r.id}
                            onClick={() => void onArchive(r, false)}
                          >
                            {busyId === r.id ? '…' : 'تفعيل'}
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn btn--ghost btn--small"
                            disabled={busyId === r.id}
                            onClick={() => void onArchive(r, true)}
                          >
                            {busyId === r.id ? '…' : 'تعطيل'}
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn btn--ghost btn--small"
                          disabled={busyId === r.id}
                          onClick={() => void onDelete(r)}
                        >
                          {busyId === r.id ? '…' : 'حذف'}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <CollegeGroupFormModal
        open={createOpen}
        mode="create"
        collegeId={collegeId}
        collegeName={collegeName}
        editRow={null}
        onClose={() => setCreateOpen(false)}
        onSaved={onReload}
      />
      {editRow ? (
        <CollegeGroupFormModal
          key={editRow.id}
          open
          mode="edit"
          collegeId={collegeId}
          collegeName={collegeName}
          editRow={editRow}
          onClose={() => setEditRow(null)}
          onSaved={onReload}
        />
      ) : null}
    </div>
  )
}
