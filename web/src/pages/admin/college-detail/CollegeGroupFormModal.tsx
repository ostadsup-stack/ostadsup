import { useEffect, useState } from 'react'
import type { GroupScheduleMode, GroupStudyTrack } from '../../../types'
import type { CollegeGroupRow } from '../../../lib/adminCollegeDetail'
import {
  createCollegeGroup,
  loadGroupInvitePayloadForAdmin,
  loadTeacherOptionsForCollege,
  updateCollegeGroup,
  type TeacherPickOption,
} from '../../../lib/adminCollegeDetail'
import { shareWhatsAppMessage } from '../../../lib/workspace'

type Mode = 'create' | 'edit'

type CollegeGroupFormModalProps = {
  open: boolean
  mode: Mode
  collegeId: string
  collegeName: string
  editRow: CollegeGroupRow | null
  onClose: () => void
  onSaved: () => void
}

type CreateInvitePanel = {
  groupName: string
  joinCode: string
  studentJoinUrl: string
  teacherSecret: string | null
  loadError: string | null
}

const LEVELS = [
  { value: 'licence' as const, label: 'إجازة' },
  { value: 'master' as const, label: 'ماستر' },
  { value: 'doctorate' as const, label: 'دكتوراه' },
]

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

export function CollegeGroupFormModal({
  open,
  mode,
  collegeId,
  collegeName,
  editRow,
  onClose,
  onSaved,
}: CollegeGroupFormModalProps) {
  const [groupName, setGroupName] = useState('')
  const [cohortSuffix, setCohortSuffix] = useState('')
  const [scheduleMode, setScheduleMode] = useState<GroupScheduleMode>('normal')
  const [studyTrack, setStudyTrack] = useState<GroupStudyTrack>('normal')
  const [studyLevel, setStudyLevel] = useState<'licence' | 'master' | 'doctorate'>('licence')
  const [ownerProfileId, setOwnerProfileId] = useState('')
  const [options, setOptions] = useState<TeacherPickOption[]>([])
  const [loadingOptions, setLoadingOptions] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formErr, setFormErr] = useState<string | null>(null)
  const [createInvitePanel, setCreateInvitePanel] = useState<CreateInvitePanel | null>(null)
  const [copyHint, setCopyHint] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setCreateInvitePanel(null)
      setCopyHint(null)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    setFormErr(null)
    if (mode === 'edit' && editRow) {
      setGroupName(editRow.group_name)
      setCohortSuffix(editRow.cohort_suffix?.trim() ?? '')
      setScheduleMode(editRow.schedule_mode === 'simplified' ? 'simplified' : 'normal')
      setStudyTrack(editRow.study_track === 'excellence' ? 'excellence' : 'normal')
      setStudyLevel(
        editRow.study_level === 'master' || editRow.study_level === 'doctorate'
          ? editRow.study_level
          : 'licence',
      )
      setOwnerProfileId('')
      return
    }
    setGroupName('')
    setCohortSuffix('')
    setScheduleMode('normal')
    setStudyTrack('normal')
    setStudyLevel('licence')
    setOwnerProfileId('')
  }, [open, mode, editRow])

  useEffect(() => {
    if (!open || mode !== 'create') return
    let ok = true
    setLoadingOptions(true)
    void loadTeacherOptionsForCollege(collegeId).then(({ options: next, error }) => {
      if (!ok) return
      setLoadingOptions(false)
      if (error) setFormErr(error)
      else {
        setOptions(next)
        if (next.length === 1) setOwnerProfileId(next[0].profile_id)
      }
    })
    return () => {
      ok = false
    }
  }, [open, mode, collegeId])

  if (!open) return null

  function finishInviteFlow() {
    setCreateInvitePanel(null)
    onClose()
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormErr(null)
    const name = groupName.trim()
    if (!name) {
      setFormErr('أدخل اسم الفوج.')
      return
    }
    if (mode === 'create' && !ownerProfileId) {
      setFormErr('اختر الأستاذ المسؤول.')
      return
    }
    setSaving(true)
    if (mode === 'create') {
      const { id: newGroupId, join_code: createdJoinCode, error } = await createCollegeGroup({
        collegeId,
        groupName: name,
        studyLevel,
        ownerProfileId,
        cohortSuffix: cohortSuffix.trim() || null,
        scheduleMode,
        studyTrack,
      })
      if (error || !newGroupId) {
        setSaving(false)
        setFormErr(error ?? 'فشل إنشاء الفوج')
        return
      }
      onSaved()
      const { payload, error: loadErr } = await loadGroupInvitePayloadForAdmin(newGroupId)
      const origin = typeof window !== 'undefined' ? window.location.origin : ''
      const joinCode = payload?.join_code ?? createdJoinCode ?? ''
      const studentJoinUrl =
        payload?.student_join_secret && origin
          ? `${origin}/s/join?t=${encodeURIComponent(payload.student_join_secret)}`
          : origin && joinCode
            ? `${origin}/s/join?code=${encodeURIComponent(joinCode)}`
            : ''
      setSaving(false)
      setCreateInvitePanel({
        groupName: payload?.group_name ?? name,
        joinCode,
        studentJoinUrl,
        teacherSecret: payload?.teacher_link_secret ?? null,
        loadError: loadErr,
      })
      return
    }
    if (!editRow) {
      setSaving(false)
      return
    }
    const { error } = await updateCollegeGroup(editRow.id, {
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

  const btnSecondary =
    'rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800'
  const btnPrimary =
    'rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-sky-700 disabled:opacity-50 dark:bg-sky-600 dark:hover:bg-sky-500'

  if (createInvitePanel) {
    const p = createInvitePanel
    const studentShareText = `انضم إلى فوج ${p.groupName} على Ostadi:\n${p.studentJoinUrl || `الكود: ${p.joinCode}`}\nالكود القصير: ${p.joinCode}`
    const teacherShareText = p.teacherSecret
      ? `دعوة للانضمام كأستاذ مساعِد إلى فوج «${p.groupName}» على Ostadi:\n1) سجّل الدخول كأستاذ\n2) من صفحة «الأفواج» → «ربط فوج من أستاذ آخر» الصق الرمز أدناه ثم اضغط ربط.\n\nالرمز:\n${p.teacherSecret}`
      : ''

    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto p-4" dir="rtl">
        <button
          type="button"
          className="absolute inset-0 bg-slate-900/50 backdrop-blur-[1px]"
          aria-label="إغلاق"
          onClick={finishInviteFlow}
        />
        <div
          role="dialog"
          aria-modal
          aria-labelledby="college-group-invite-title"
          className="relative z-10 flex max-h-[min(90dvh,calc(100vh-2rem))] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-[#111827]"
        >
          <h2 id="college-group-invite-title" className="shrink-0 text-lg font-semibold text-slate-900 dark:text-slate-50">
            إرسال الدعوات
          </h2>
          <p className="mt-1 shrink-0 text-sm text-slate-600 dark:text-slate-400">
            تم إنشاء فوج «{p.groupName}». انسخ الرابط أو الرمز أدناه وأرسله للمستلمين.
          </p>
          {p.loadError ? (
            <p className="mt-2 shrink-0 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
              تعذر تحميل بعض بيانات الدعوة: {p.loadError}
            </p>
          ) : null}
          {copyHint ? (
            <p className="mt-2 shrink-0 text-xs text-emerald-700 dark:text-emerald-400" role="status">
              {copyHint}
            </p>
          ) : null}

          <div className="mt-4 min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain pe-1">
            <section className="rounded-xl border border-slate-200/90 bg-slate-50/80 p-4 dark:border-slate-600 dark:bg-slate-900/50">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">الطلاب والمنسقون</h3>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                المنسق ينضم بنفس رابط الطالب؛ بعد التسجيل في الفوج يرفع الأستاذ المسؤول دوره إلى منسق من صفحة
                أعضاء الفوج.
              </p>
              <p className="mt-2 text-xs font-medium text-slate-700 dark:text-slate-300">كود الانضمام القصير</p>
              <p className="break-all font-mono text-sm text-slate-900 dark:text-slate-100" dir="ltr">
                {p.joinCode || '—'}
              </p>
              {p.studentJoinUrl ? (
                <>
                  <p className="mt-3 text-xs font-medium text-slate-700 dark:text-slate-300">رابط الانضمام</p>
                  <p className="break-all text-xs text-slate-800 dark:text-slate-200" dir="ltr">
                    {p.studentJoinUrl}
                  </p>
                </>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                {p.joinCode ? (
                  <button
                    type="button"
                    className={btnSecondary}
                    onClick={() =>
                      void copyToClipboard(p.joinCode).then((ok) => {
                        setCopyHint(ok ? 'تم نسخ الكود.' : 'تعذر النسخ من المتصفح.')
                        setTimeout(() => setCopyHint(null), 2500)
                      })
                    }
                  >
                    نسخ الكود
                  </button>
                ) : null}
                {p.studentJoinUrl ? (
                  <button
                    type="button"
                    className={btnSecondary}
                    onClick={() =>
                      void copyToClipboard(p.studentJoinUrl).then((ok) => {
                        setCopyHint(ok ? 'تم نسخ الرابط.' : 'تعذر النسخ من المتصفح.')
                        setTimeout(() => setCopyHint(null), 2500)
                      })
                    }
                  >
                    نسخ الرابط
                  </button>
                ) : null}
                <button
                  type="button"
                  className={btnSecondary}
                  onClick={() => shareWhatsAppMessage(studentShareText)}
                >
                  مشاركة واتساب
                </button>
              </div>
            </section>

            <section className="rounded-xl border border-slate-200/90 bg-slate-50/80 p-4 dark:border-slate-600 dark:bg-slate-900/50">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">الأساتذة (ربط فوج)</h3>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                لا يُشارك مع الطلبة. يلصق الأستاذ المُدعى الرمز في «ربط فوج من أستاذ آخر» ضمن صفحة الأفواج لديه.
              </p>
              {p.teacherSecret ? (
                <>
                  <p className="mt-2 break-all font-mono text-xs text-slate-900 dark:text-slate-100" dir="ltr">
                    {p.teacherSecret}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={btnSecondary}
                      onClick={() =>
                        void copyToClipboard(p.teacherSecret!).then((ok) => {
                          setCopyHint(ok ? 'تم نسخ رمز الأستاذ.' : 'تعذر النسخ من المتصفح.')
                          setTimeout(() => setCopyHint(null), 2500)
                        })
                      }
                    >
                      نسخ الرمز
                    </button>
                    <button
                      type="button"
                      className={btnSecondary}
                      onClick={() => shareWhatsAppMessage(teacherShareText)}
                    >
                      مشاركة واتساب
                    </button>
                  </div>
                </>
              ) : (
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">لا يتوفر رمز ربط أساتذة من الخادم.</p>
              )}
            </section>
          </div>

          <div className="mt-4 shrink-0 border-t border-slate-200/90 pt-4 dark:border-slate-600/80">
            <button type="button" className={`w-full sm:w-auto ${btnPrimary}`} onClick={finishInviteFlow}>
              تم
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto p-4" dir="rtl">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-[1px]"
        aria-label="إغلاق"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal
        aria-labelledby="college-group-form-title"
        className="relative z-10 flex max-h-[min(90dvh,calc(100vh-2rem))] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-[#111827]"
      >
        <h2 id="college-group-form-title" className="shrink-0 text-lg font-semibold text-slate-900 dark:text-slate-50">
          {mode === 'create' ? 'إنشاء فوج جديد' : 'تعديل فوج'}
        </h2>
        <form className="mt-5 flex min-h-0 flex-1 flex-col" onSubmit={(e) => void onSubmit(e)}>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain pe-1">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300" htmlFor="cg-name">
                اسم الفوج
              </label>
              <input
                id="cg-name"
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none ring-sky-500/30 focus:border-sky-500 focus:ring-2 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                value={groupName}
                onChange={(ev) => setGroupName(ev.target.value)}
                autoComplete="off"
                placeholder="مثال: شعبة 1"
              />
            </div>
            <div>
              <label
                className="block text-sm font-medium text-slate-700 dark:text-slate-300"
                htmlFor="cg-letter"
              >
                الحرف (لاحقة)
              </label>
              <input
                id="cg-letter"
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none ring-sky-500/30 focus:border-sky-500 focus:ring-2 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                value={cohortSuffix}
                onChange={(ev) => setCohortSuffix(ev.target.value)}
                autoComplete="off"
                placeholder="مثال: A، B (اختياري)"
                maxLength={32}
              />
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">يُخزَّن كمكوّن في الرمز الرسمي للفوج.</p>
            </div>
            <div>
              <label
                className="block text-sm font-medium text-slate-700 dark:text-slate-300"
                htmlFor="cg-schedule"
              >
                التوقيت
              </label>
              <select
                id="cg-schedule"
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/30 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                value={scheduleMode}
                onChange={(ev) => setScheduleMode(ev.target.value as GroupScheduleMode)}
              >
                <option value="normal">توقيت عادي</option>
                <option value="simplified">توقيت ميسر</option>
              </select>
            </div>
            <div>
              <label
                className="block text-sm font-medium text-slate-700 dark:text-slate-300"
                htmlFor="cg-track"
              >
                المسار
              </label>
              <select
                id="cg-track"
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
                      name="studyLevel"
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
              <span className="block text-sm font-medium text-slate-700 dark:text-slate-300">الكلية</span>
              <p className="mt-1.5 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200">
                {collegeName}
              </p>
            </div>
            {mode === 'create' ? (
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300" htmlFor="cg-teacher">
                  الأستاذ المسؤول
                </label>
                <select
                  id="cg-teacher"
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/30 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                  value={ownerProfileId}
                  onChange={(ev) => setOwnerProfileId(ev.target.value)}
                  disabled={loadingOptions}
                >
                  <option value="">{loadingOptions ? 'جاري التحميل…' : '— اختر —'}</option>
                  {options.map((o) => (
                    <option key={o.profile_id} value={o.profile_id}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  يُنشأ الفوج تحت مساحة الأستاذ في المنصة. لربط أساتذة الكتالوج، عيّن profile_id في جدول teachers.
                </p>
              </div>
            ) : (
              <div>
                <span className="block text-sm font-medium text-slate-700 dark:text-slate-300">الأستاذ المسؤول</span>
                <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">{editRow?.owner_name ?? '—'}</p>
              </div>
            )}
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
            <button type="submit" disabled={saving} className={btnPrimary}>
              {saving ? '…' : 'حفظ'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
