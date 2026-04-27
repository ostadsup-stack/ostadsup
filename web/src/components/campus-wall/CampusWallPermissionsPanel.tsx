import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { campusWallRoleLabelAr, fetchCampusWallSettings, updateCampusWallSettings, type CampusWallRole } from '../../lib/campusWall'

const ROLES: CampusWallRole[] = ['admin', 'teacher', 'coordinator', 'student']

type MatrixKey = 'write_roles' | 'comment_roles' | 'pin_roles' | 'delete_roles' | 'require_approval_roles'

const ROWS: { key: MatrixKey; label: string; hint: string }[] = [
  { key: 'write_roles', label: 'الكتابة والنشر', hint: 'من يستطيع إنشاء منشور على الحائط.' },
  { key: 'comment_roles', label: 'التعليق', hint: 'من يستطيع التعليق على المنشورات المنشورة.' },
  { key: 'pin_roles', label: 'التثبيت', hint: 'من يستطيع تثبيت منشوره في الأعلى.' },
  { key: 'delete_roles', label: 'الحذف / الإخفاء للمنشورات العامة', hint: 'من يستطيع إخفاء أو أرشفة منشورات الآخرين.' },
  {
    key: 'require_approval_roles',
    label: 'يحتاج موافقة قبل النشر',
    hint: 'يُرسَل المنشور كـ «بانتظار الموافقة» قبل الظهور للجميع.',
  },
]

function roleSet(arr: string[] | null | undefined): Set<string> {
  return new Set((arr ?? []).filter(Boolean))
}

export function CampusWallPermissionsPanel() {
  const [write, setWrite] = useState<Set<string>>(new Set())
  const [comment, setComment] = useState<Set<string>>(new Set())
  const [pin, setPin] = useState<Set<string>>(new Set())
  const [del, setDel] = useState<Set<string>>(new Set())
  const [approval, setApproval] = useState<Set<string>>(new Set())
  const [extraIds, setExtraIds] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setErr(null)
    const { row, error } = await fetchCampusWallSettings(supabase)
    setLoading(false)
    if (error || !row) {
      setErr(error ?? 'تعذر التحميل.')
      return
    }
    setWrite(roleSet(row.write_roles))
    setComment(roleSet(row.comment_roles))
    setPin(roleSet(row.pin_roles))
    setDel(roleSet(row.delete_roles))
    setApproval(roleSet(row.require_approval_roles))
    setExtraIds((row.extra_student_writer_ids ?? []).join(', '))
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  function matrixFor(key: MatrixKey): { set: Set<string>; setSet: (s: Set<string>) => void } {
    if (key === 'write_roles') return { set: write, setSet: setWrite }
    if (key === 'comment_roles') return { set: comment, setSet: setComment }
    if (key === 'pin_roles') return { set: pin, setSet: setPin }
    if (key === 'delete_roles') return { set: del, setSet: setDel }
    return { set: approval, setSet: setApproval }
  }

  function toggle(key: MatrixKey, role: string) {
    const { set, setSet } = matrixFor(key)
    const n = new Set(set)
    if (n.has(role)) n.delete(role)
    else n.add(role)
    setSet(n)
  }

  async function onSave() {
    setSaving(true)
    setErr(null)
    setOk(null)
    const extras = extraIds
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean)
    const uuidOk = extras.every((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))
    if (!uuidOk) {
      setErr('معرّفات الطلاب الإضافية يجب أن تكون UUID مفصولة بفواصل أو مسافات.')
      setSaving(false)
      return
    }
    const { error } = await updateCampusWallSettings(supabase, {
      write_roles: [...write],
      comment_roles: [...comment],
      pin_roles: [...pin],
      delete_roles: [...del],
      require_approval_roles: [...approval],
      extra_student_writer_ids: extras,
    })
    setSaving(false)
    if (error) setErr(error)
    else setOk('تم حفظ الإعدادات.')
  }

  if (loading) {
    return <p className="text-sm text-slate-500">جاري تحميل الصلاحيات…</p>
  }

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">إدارة الصلاحيات</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          حدّد الأدوار لكل فعل. المدير يتجاوز هذه القيود دائماً في النظام.
        </p>
      </div>
      {err ? <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-100">{err}</p> : null}
      {ok ? <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/25 dark:text-emerald-100">{ok}</p> : null}
      <div className="overflow-x-auto rounded-2xl border border-slate-200/90 bg-white shadow-sm dark:border-slate-700 dark:bg-[#0f172a]/90">
        <table className="w-full min-w-[520px] text-right text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/90 dark:border-slate-700 dark:bg-slate-900/50">
              <th className="px-3 py-2 font-semibold text-slate-700 dark:text-slate-200">الصلاحية</th>
              {ROLES.map((r) => (
                <th key={r} className="px-2 py-2 font-semibold text-slate-600 dark:text-slate-300">
                  {campusWallRoleLabelAr(r)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.key} className="border-b border-slate-100 dark:border-slate-800/80">
                <td className="px-3 py-3 align-top">
                  <div className="font-medium text-slate-800 dark:text-slate-100">{row.label}</div>
                  <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{row.hint}</div>
                </td>
                {ROLES.map((r) => {
                  const { set } = matrixFor(row.key)
                  const on = set.has(r)
                  return (
                    <td key={r} className="px-2 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggle(row.key, r)}
                        className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        aria-label={`${row.label} — ${campusWallRoleLabelAr(r)}`}
                      />
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <label className="block">
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">طلاب مسموح لهم بالنشر (معرّفات UUID إضافية)</span>
        <textarea
          value={extraIds}
          onChange={(e) => setExtraIds(e.target.value)}
          rows={2}
          placeholder="مثال: uuid1, uuid2"
          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-950/50 dark:text-slate-100"
          dir="ltr"
        />
      </label>
      <button
        type="button"
        disabled={saving}
        onClick={() => void onSave()}
        className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
      >
        {saving ? '…' : 'حفظ الصلاحيات'}
      </button>
    </div>
  )
}
