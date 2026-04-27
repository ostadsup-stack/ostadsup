import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import {
  CAMPUS_WALL_IMPORTANCE,
  CAMPUS_WALL_POST_KINDS,
  CAMPUS_WALL_MODERATION,
  campusWallPostKindLabelAr,
  type CampusWallAttachment,
  type CampusWallImportance,
  type CampusWallModerationStatus,
  type CampusWallPostKind,
} from '../../lib/campusWall'

type Opt = { id: string; name: string; college_id?: string | null }

type CampusWallComposerProps = {
  open: boolean
  onClose: () => void
  onSaved: () => void
  userId: string
  isAdmin: boolean
  colleges: Opt[]
  groups: { id: string; group_name: string; college_id: string | null }[]
}

const emptyAttachment: CampusWallAttachment = { url: '', name: '' }

export function CampusWallComposer({ open, onClose, onSaved, userId, isAdmin, colleges, groups }: CampusWallComposerProps) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [postKind, setPostKind] = useState<CampusWallPostKind>('admin_notice')
  const [importance, setImportance] = useState<CampusWallImportance>('normal')
  const [collegeId, setCollegeId] = useState<string>('')
  const [groupId, setGroupId] = useState<string>('')
  const [moderation, setModeration] = useState<CampusWallModerationStatus>('published')
  const [attachments, setAttachments] = useState<CampusWallAttachment[]>([{ ...emptyAttachment }])
  const [err, setErr] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  if (!open) return null

  const filteredGroups = collegeId ? groups.filter((g) => g.college_id === collegeId) : groups

  function reset() {
    setTitle('')
    setBody('')
    setPostKind('admin_notice')
    setImportance('normal')
    setCollegeId('')
    setGroupId('')
    setModeration('published')
    setAttachments([{ ...emptyAttachment }])
    setErr(null)
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const b = body.trim()
    if (!b) {
      setErr('نص المنشور مطلوب.')
      return
    }
    const atts = attachments
      .map((a) => ({ url: a.url.trim(), name: a.name?.trim() || null }))
      .filter((a) => a.url.length > 0)
    setSaving(true)
    setErr(null)
    const row: Record<string, unknown> = {
      author_id: userId,
      post_kind: postKind,
      importance,
      title: title.trim() || null,
      body: b,
      attachments: atts,
      college_id: collegeId || null,
      group_id: groupId || null,
      pinned: false,
    }
    if (isAdmin) {
      row.moderation_status = moderation
    }
    const { error } = await supabase.from('campus_wall_posts').insert(row)
    setSaving(false)
    if (error) {
      setErr(error.message)
      return
    }
    reset()
    onSaved()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-900/50 p-4 sm:items-center" dir="rtl">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="إغلاق" onClick={onClose} />
      <div
        role="dialog"
        aria-modal
        aria-labelledby="campus-wall-composer-title"
        className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-[#111827]"
      >
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 id="campus-wall-composer-title" className="text-lg font-semibold text-slate-900 dark:text-slate-50">
            منشور جديد
          </h2>
          <button
            type="button"
            className="rounded-lg px-2 py-1 text-sm text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            onClick={onClose}
          >
            إغلاق
          </button>
        </div>
        <form onSubmit={(e) => void onSubmit(e)} className="space-y-3">
          {err ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:bg-rose-950/40 dark:text-rose-100">{err}</p> : null}
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            نوع المنشور
            <select
              value={postKind}
              onChange={(e) => setPostKind(e.target.value as CampusWallPostKind)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950/50"
            >
              {CAMPUS_WALL_POST_KINDS.map((k) => (
                <option key={k} value={k}>
                  {campusWallPostKindLabelAr(k)}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            الأهمية
            <select
              value={importance}
              onChange={(e) => setImportance(e.target.value as CampusWallImportance)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950/50"
            >
              {CAMPUS_WALL_IMPORTANCE.map((i) => (
                <option key={i} value={i}>
                  {i === 'urgent' ? 'عاجل' : i === 'high' ? 'مهم' : 'عادي'}
                </option>
              ))}
            </select>
          </label>
          {colleges.length > 0 ? (
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              الكلية (اختياري)
              <select
                value={collegeId}
                onChange={(e) => {
                  setCollegeId(e.target.value)
                  setGroupId('')
                }}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950/50"
              >
                <option value="">— عام —</option>
                {colleges.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {groups.length > 0 ? (
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              الفوج (اختياري)
              <select
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950/50"
              >
                <option value="">— بدون فوج —</option>
                {filteredGroups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.group_name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {isAdmin ? (
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              حالة النشر
              <select
                value={moderation}
                onChange={(e) => setModeration(e.target.value as CampusWallModerationStatus)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950/50"
              >
                {CAMPUS_WALL_MODERATION.map((m) => (
                  <option key={m} value={m}>
                    {m === 'published' ? 'منشور' : m === 'pending' ? 'بانتظار المراجعة' : m === 'draft' ? 'مسودة' : 'مرفوض'}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            عنوان (اختياري)
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950/50"
            />
          </label>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            النص
            <textarea
              required
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950/50"
            />
          </label>
          <div className="space-y-2">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">مرفقات (روابط)</span>
            {attachments.map((a, i) => (
              <div key={i} className="flex flex-col gap-2 sm:flex-row">
                <input
                  placeholder="رابط الملف"
                  value={a.url}
                  onChange={(e) => {
                    const next = [...attachments]
                    next[i] = { ...next[i]!, url: e.target.value }
                    setAttachments(next)
                  }}
                  className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950/50"
                  dir="ltr"
                />
                <input
                  placeholder="اسم العرض"
                  value={a.name ?? ''}
                  onChange={(e) => {
                    const next = [...attachments]
                    next[i] = { ...next[i]!, name: e.target.value }
                    setAttachments(next)
                  }}
                  className="sm:w-36 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950/50"
                />
              </div>
            ))}
            <button
              type="button"
              className="text-xs font-semibold text-indigo-600 dark:text-indigo-400"
              onClick={() => setAttachments((x) => [...x, { ...emptyAttachment }])}
            >
              + إضافة رابط
            </button>
          </div>
          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <button
              type="button"
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 dark:border-slate-600 dark:text-slate-200"
              onClick={onClose}
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? '…' : 'نشر'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
