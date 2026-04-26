import { useState } from 'react'
import { insertUniversity } from '../../lib/adminUniversitiesDashboard'

type CreateUniversityModalProps = {
  open: boolean
  onClose: () => void
  onCreated: () => void
}

export function CreateUniversityModal({ open, onClose, onCreated }: CreateUniversityModalProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  if (!open) return null

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    const n = name.trim()
    if (!n) {
      setErr('اسم الجامعة مطلوب.')
      return
    }
    setSaving(true)
    const { error } = await insertUniversity({
      name: n,
      description: description.trim() || null,
    })
    setSaving(false)
    if (error) {
      setErr(error)
      return
    }
    setName('')
    setDescription('')
    onCreated()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" dir="rtl">
      <button type="button" className="absolute inset-0 bg-slate-900/50 backdrop-blur-[1px]" aria-label="إغلاق" onClick={onClose} />
      <div
        role="dialog"
        aria-modal
        aria-labelledby="create-uni-title"
        className="relative z-10 w-full max-w-md rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-[#111827]"
      >
        <h2 id="create-uni-title" className="text-lg font-semibold text-slate-900 dark:text-slate-50">
          إنشاء حساب جامعة
        </h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          سجّل المؤسسة الجامعية ثم أضف الكليات من داخل صفحة الجامعة.
        </p>
        <form className="mt-5 space-y-4" onSubmit={(e) => void onSubmit(e)}>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300" htmlFor="uni-name">
              اسم الجامعة
            </label>
            <input
              id="uni-name"
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
              value={name}
              onChange={(ev) => setName(ev.target.value)}
              placeholder="مثال: جامعة الجزائر 1"
              autoComplete="organization"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300" htmlFor="uni-desc">
              تعريف الجامعة
            </label>
            <textarea
              id="uni-desc"
              rows={4}
              className="mt-1.5 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
              value={description}
              onChange={(ev) => setDescription(ev.target.value)}
              placeholder="نبذة عن الجامعة، الرسالة، التخصصات العامة…"
            />
          </div>
          {err ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
              {err}
            </p>
          ) : null}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
              onClick={onClose}
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50 dark:bg-indigo-600 dark:hover:bg-indigo-500"
            >
              {saving ? '…' : 'حفظ الجامعة'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
