import { useEffect, useState } from 'react'
import type { GroupScheduleMode, GroupStudyTrack } from '../../types'
import { loadGroupForAdminEdit, updateCollegeGroup, type AdminGroupEditRow } from '../../lib/adminCollegeDetail'

const LEVELS = [
  { value: 'licence' as const, label: 'إجازة' },
  { value: 'master' as const, label: 'ماستر' },
  { value: 'doctorate' as const, label: 'دكتوراه' },
]

const btnPrimary =
  'rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-sky-700 disabled:opacity-50 dark:bg-sky-600 dark:hover:bg-sky-500'

type Props = {
  open: boolean
  onClose: () => void
  onSaved: () => void
  groupId: string
}

export function AdminGroupEditModal({ open, onClose, onSaved, groupId }: Props) {
  const [loading, setLoading] = useState(true)
  const [groupName, setGroupName] = useState('')
  const [cohortSuffix, setCohortSuffix] = useState('')
  const [scheduleMode, setScheduleMode] = useState<GroupScheduleMode>('normal')
  const [studyTrack, setStudyTrack] = useState<GroupStudyTrack>('normal')
  const [studyLevel, setStudyLevel] = useState<'licence' | 'master' | 'doctorate'>('licence')
  const [ownerName, setOwnerName] = useState('—')
  const [joinCode, setJoinCode] = useState('')
  const [saving, setSaving] = useState(false)
  const [formErr, setFormErr] = useState<string | null>(null)
  const [loadInitError, setLoadInitError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let ok = true
    setFormErr(null)
    setLoadInitError(null)
    setLoading(true)
    void loadGroupForAdminEdit(groupId).then(({ row, error }) => {
      if (!ok) return
      setLoading(false)
      if (error || !row) {
        setLoadInitError(error ?? 'تعذر تحميل الفوج.')
        return
      }
      applyRow(row)
    })
    return () => {
      ok = false
    }
  }, [open, groupId])

  function applyRow(r: AdminGroupEditRow) {
    setGroupName(r.group_name)
    setCohortSuffix(r.cohort_suffix?.trim() ?? '')
    setScheduleMode(r.schedule_mode === 'simplified' ? 'simplified' : 'normal')
    setStudyTrack(r.study_track === 'excellence' ? 'excellence' : 'normal')
    setStudyLevel(
      r.study_level === 'master' || r.study_level === 'doctorate' ? r.study_level : 'licence',
    )
    setOwnerName(r.owner_name)
    setJoinCode(r.join_code?.trim() || '')
  }

  if (!open) return null

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormErr(null)
    const name = groupName.trim()
    if (!name) {
      setFormErr('أدخل اسم الفوج.')
      return
    }
    setSaving(true)
    const { error } = await updateCollegeGroup(groupId, {
      group_name: name,
      study_level: studyLevel,
      cohort_suffix: cohortSuffix.trim() || null,
      schedule_mode: scheduleMode,
      study_track: studyTrack,
    })
    setSaving(false)
    if (error) {
      setFormErr(error)
      return
    }
    onSaved()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto p-4" dir="rtl">
      <button type="button" className="absolute inset-0 bg-slate-900/50 backdrop-blur-[1px]" aria-label="إغلاق" onClick={onClose} />
      <div
        role="dialog"
        aria-modal
        aria-labelledby="admin-group-edit-title"
        className="relative z-10 flex max-h-[min(90dvh,calc(100vh-2rem))] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-[#111827]"
      >
        <h2 id="admin-group-edit-title" className="shrink-0 text-lg font-semibold text-slate-900 dark:text-slate-50">
          تعديل الفوج
        </h2>
        {loading ? (
          <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">جاري التحميل…</p>
        ) : loadInitError ? (
          <>
            <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
              {loadInitError}
            </p>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                onClick={onClose}
              >
                إغلاق
              </button>
            </div>
          </>
        ) : (
          <form className="mt-5 flex min-h-0 flex-1 flex-col" onSubmit={(e) => void onSubmit(e)}>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain pe-1">
              <div>
                <span className="block text-sm font-medium text-slate-700 dark:text-slate-300">كود الانضمام</span>
                <p className="input--ltr mt-1.5 break-all font-mono text-sm text-slate-800 dark:text-slate-200" dir="ltr">
                  {joinCode || '—'}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300" htmlFor="ag-name">
                  اسم الفوج
                </label>
                <input
                  id="ag-name"
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none ring-sky-500/30 focus:border-sky-500 focus:ring-2 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                  value={groupName}
                  onChange={(ev) => setGroupName(ev.target.value)}
                  autoComplete="off"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300" htmlFor="ag-suffix">
                  الحرف (لاحقة)
                </label>
                <input
                  id="ag-suffix"
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none ring-sky-500/30 focus:border-sky-500 focus:ring-2 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                  value={cohortSuffix}
                  onChange={(ev) => setCohortSuffix(ev.target.value)}
                  autoComplete="off"
                  maxLength={32}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300" htmlFor="ag-schedule">
                  التوقيت
                </label>
                <select
                  id="ag-schedule"
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/30 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                  value={scheduleMode}
                  onChange={(ev) => setScheduleMode(ev.target.value as GroupScheduleMode)}
                >
                  <option value="normal">توقيت عادي</option>
                  <option value="simplified">توقيت ميسر</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300" htmlFor="ag-track">
                  المسار
                </label>
                <select
                  id="ag-track"
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/30 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                  value={studyTrack}
                  onChange={(ev) => setStudyTrack(ev.target.value as GroupStudyTrack)}
                >
                  <option value="normal">مسار عادي</option>
                  <option value="excellence">مسار التميّز</option>
                </select>
              </div>
              <div>
                <span className="block text-sm font-medium text-slate-700 dark:text-slate-300">النوع</span>
                <div className="mt-2 flex flex-wrap gap-2">
                  {LEVELS.map((lv) => (
                    <label
                      key={lv.value}
                      className={`cursor-pointer rounded-xl border px-3 py-2 text-sm font-medium transition ${
                        studyLevel === lv.value
                          ? 'border-sky-500 bg-sky-50 text-sky-800 dark:border-sky-500 dark:bg-sky-950/40 dark:text-sky-200'
                          : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-600 dark:text-slate-400'
                      }`}
                    >
                      <input
                        type="radio"
                        name="ag-studyLevel"
                        value={lv.value}
                        className="sr-only"
                        checked={studyLevel === lv.value}
                        onChange={() => setStudyLevel(lv.value)}
                      />
                      {lv.label}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <span className="block text-sm font-medium text-slate-700 dark:text-slate-300">الأستاذ المسؤول (مساحة)</span>
                <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">{ownerName}</p>
              </div>
            </div>
            {formErr ? (
              <p className="mt-3 shrink-0 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                {formErr}
              </p>
            ) : null}
            <div className="mt-4 flex shrink-0 justify-end gap-2 border-t border-slate-200/90 pt-4 dark:border-slate-600/80">
              <button
                type="button"
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                onClick={onClose}
              >
                إلغاء
              </button>
              <button type="submit" disabled={saving || loading} className={btnPrimary}>
                {saving ? '…' : 'حفظ'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
