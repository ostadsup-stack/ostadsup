import { useEffect, useRef, useState } from 'react'
import { loadGroupInvitePayloadForAdmin } from '../../lib/adminCollegeDetail'
import { shareWhatsAppMessage } from '../../lib/workspace'

type InviteFocus = 'teacher' | 'student'

type Props = {
  open: boolean
  onClose: () => void
  groupId: string
  groupLabel: string
  /** أي قسم يُبرز عند فتح النافذة من زر دعوة أستاذ أو دعوة طالب/منسق */
  focus: InviteFocus
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

const btnSecondary =
  'rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800'
const btnPrimary =
  'rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-sky-700 dark:bg-sky-600 dark:hover:bg-sky-500'

export function AdminGroupInviteModal({ open, onClose, groupId, groupLabel, focus }: Props) {
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [groupName, setGroupName] = useState(groupLabel)
  const [joinCode, setJoinCode] = useState('')
  const [studentJoinUrl, setStudentJoinUrl] = useState('')
  const [teacherSecret, setTeacherSecret] = useState<string | null>(null)
  const [copyHint, setCopyHint] = useState<string | null>(null)
  const teacherRef = useRef<HTMLDivElement>(null)
  const studentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) {
      setLoading(true)
      setLoadError(null)
      setCopyHint(null)
      return
    }
    setGroupName(groupLabel)
    let ok = true
    setLoading(true)
    setLoadError(null)
    void loadGroupInvitePayloadForAdmin(groupId).then(({ payload, error }) => {
      if (!ok) return
      setLoading(false)
      if (error || !payload) {
        setLoadError(error ?? 'تعذر تحميل بيانات الدعوة.')
        return
      }
      const origin = typeof window !== 'undefined' ? window.location.origin : ''
      const code = payload.join_code ?? ''
      const url =
        payload.student_join_secret && origin
          ? `${origin}/s/join?t=${encodeURIComponent(payload.student_join_secret)}`
          : origin && code
            ? `${origin}/s/join?code=${encodeURIComponent(code)}`
            : ''
      setGroupName(payload.group_name?.trim() || groupLabel)
      setJoinCode(code)
      setStudentJoinUrl(url)
      setTeacherSecret(payload.teacher_link_secret ?? null)
    })
    return () => {
      ok = false
    }
  }, [open, groupId, groupLabel])

  useEffect(() => {
    if (!open || loading) return
    const el = focus === 'teacher' ? teacherRef.current : studentRef.current
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [open, loading, focus])

  if (!open) return null

  const studentShareText = `انضم إلى فوج ${groupName} على Ostadi:\n${studentJoinUrl || `الكود: ${joinCode}`}\nالكود القصير: ${joinCode}`
  const teacherShareText = teacherSecret
    ? `دعوة للانضمام كأستاذ مساعِد إلى فوج «${groupName}» على Ostadi:\n1) سجّل الدخول كأستاذ\n2) من صفحة «الأفواج» → «ربط فوج من أستاذ آخر» الصق الرمز أدناه ثم اضغط ربط.\n\nالرمز:\n${teacherSecret}`
    : ''

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto p-4" dir="rtl">
      <button type="button" className="absolute inset-0 bg-slate-900/50 backdrop-blur-[1px]" aria-label="إغلاق" onClick={onClose} />
      <div
        role="dialog"
        aria-modal
        aria-labelledby="admin-group-invite-title"
        className="relative z-10 flex max-h-[min(90dvh,calc(100vh-2rem))] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-[#111827]"
      >
        <h2 id="admin-group-invite-title" className="shrink-0 text-lg font-semibold text-slate-900 dark:text-slate-50">
          {focus === 'teacher' ? 'إرسال دعوة لأستاذ' : 'إرسال دعوة لطالب (منسق)'}
        </h2>
        <p className="mt-1 shrink-0 text-sm text-slate-600 dark:text-slate-400">
          انسخ الرمز أو الرابط أدناه وأرسله للمستلم. المنسق ينضم بنفس رابط الطالب؛ يرقّى لاحقاً إلى منسق من أعضاء الفوج.
        </p>
        {loadError ? (
          <p className="mt-2 shrink-0 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
            {loadError}
          </p>
        ) : null}
        {loading ? (
          <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">جاري التحميل…</p>
        ) : (
          <>
            {copyHint ? (
              <p className="mt-2 shrink-0 text-xs text-emerald-700 dark:text-emerald-400" role="status">
                {copyHint}
              </p>
            ) : null}
            <div className="mt-4 min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain pe-1">
              <div ref={studentRef}>
                <section className="rounded-xl border border-slate-200/90 bg-slate-50/80 p-4 dark:border-slate-600 dark:bg-slate-900/50">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">الطلاب والمنسقون</h3>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                    المنسق ينضم بنفس رابط الطالب؛ بعد التسجيل يرقّى الأستاذ المسؤول دوره إلى منسق من صفحة أعضاء الفوج.
                  </p>
                  <p className="mt-2 text-xs font-medium text-slate-700 dark:text-slate-300">كود الانضمام القصير</p>
                  <p className="break-all font-mono text-sm text-slate-900 dark:text-slate-100" dir="ltr">
                    {joinCode || '—'}
                  </p>
                  {studentJoinUrl ? (
                    <>
                      <p className="mt-3 text-xs font-medium text-slate-700 dark:text-slate-300">رابط الانضمام</p>
                      <p className="break-all text-xs text-slate-800 dark:text-slate-200" dir="ltr">
                        {studentJoinUrl}
                      </p>
                    </>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {joinCode ? (
                      <button
                        type="button"
                        className={btnSecondary}
                        onClick={() =>
                          void copyToClipboard(joinCode).then((ok) => {
                            setCopyHint(ok ? 'تم نسخ الكود.' : 'تعذر النسخ من المتصفح.')
                            setTimeout(() => setCopyHint(null), 2500)
                          })
                        }
                      >
                        نسخ الكود
                      </button>
                    ) : null}
                    {studentJoinUrl ? (
                      <button
                        type="button"
                        className={btnSecondary}
                        onClick={() =>
                          void copyToClipboard(studentJoinUrl).then((ok) => {
                            setCopyHint(ok ? 'تم نسخ الرابط.' : 'تعذر النسخ من المتصفح.')
                            setTimeout(() => setCopyHint(null), 2500)
                          })
                        }
                      >
                        نسخ الرابط
                      </button>
                    ) : null}
                    <button type="button" className={btnSecondary} onClick={() => shareWhatsAppMessage(studentShareText)}>
                      مشاركة واتساب
                    </button>
                  </div>
                </section>
              </div>

              <div ref={teacherRef}>
                <section className="rounded-xl border border-slate-200/90 bg-slate-50/80 p-4 dark:border-slate-600 dark:bg-slate-900/50">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">الأساتذة (ربط فوج)</h3>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                    لا يُشارك مع الطلبة. يلصق الأستاذ المُدعى الرمز في «ربط فوج من أستاذ آخر» ضمن صفحة الأفواج لديه.
                  </p>
                  {teacherSecret ? (
                    <>
                      <p className="mt-2 break-all font-mono text-xs text-slate-900 dark:text-slate-100" dir="ltr">
                        {teacherSecret}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          className={btnSecondary}
                          onClick={() =>
                            void copyToClipboard(teacherSecret).then((ok) => {
                              setCopyHint(ok ? 'تم نسخ رمز الأستاذ.' : 'تعذر النسخ من المتصفح.')
                              setTimeout(() => setCopyHint(null), 2500)
                            })
                          }
                        >
                          نسخ الرمز
                        </button>
                        <button type="button" className={btnSecondary} onClick={() => shareWhatsAppMessage(teacherShareText)}>
                          مشاركة واتساب
                        </button>
                      </div>
                    </>
                  ) : (
                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">لا يتوفر رمز ربط أساتذة من الخادم.</p>
                  )}
                </section>
              </div>
            </div>
          </>
        )}

        <div className="mt-4 shrink-0 border-t border-slate-200/90 pt-4 dark:border-slate-600/80">
          <button type="button" className={`w-full sm:w-auto ${btnPrimary}`} onClick={onClose}>
            تم
          </button>
        </div>
      </div>
    </div>
  )
}
