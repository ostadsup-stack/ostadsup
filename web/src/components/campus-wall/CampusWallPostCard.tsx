import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { formatAppDateTime } from '../../lib/appDateTime'
import {
  campusWallDisplayRole,
  campusWallImportanceLabelAr,
  campusWallPostKindLabelAr,
  campusWallRoleLabelAr,
  fetchCampusWallComments,
  insertCampusWallReport,
  type AuthorProfileBrief,
  type CampusWallCapabilities,
  type CampusWallPostWithRelations,
} from '../../lib/campusWall'

type CampusWallPostCardProps = {
  post: CampusWallPostWithRelations
  author: AuthorProfileBrief | undefined
  isCoordinator: boolean
  caps: CampusWallCapabilities
  viewerId: string
  onChanged: () => void
}

export function CampusWallPostCard({ post, author, isCoordinator, caps, viewerId, onChanged }: CampusWallPostCardProps) {
  const [busy, setBusy] = useState<string | null>(null)
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [comments, setComments] = useState<{ id: string; author_id: string; body: string; created_at: string }[]>([])
  const [commentBody, setCommentBody] = useState('')
  const [commentErr, setCommentErr] = useState<string | null>(null)
  const [names, setNames] = useState<Record<string, string>>({})

  const displayRole = author ? campusWallDisplayRole(author, isCoordinator) : '—'
  const roleLabel = campusWallRoleLabelAr(displayRole)
  const isAuthor = post.author_id === viewerId
  const canModerate = caps.is_admin || caps.can_delete_any

  const loadComments = useCallback(async () => {
    const { rows, error } = await fetchCampusWallComments(supabase, post.id)
    if (error) return
    setComments(rows)
    const ids = [...new Set(rows.map((c) => c.author_id))]
    if (ids.length === 0) return
    const { data } = await supabase.from('profiles').select('id, full_name').in('id', ids)
    const m: Record<string, string> = {}
    for (const r of (data as { id: string; full_name: string }[]) ?? []) {
      m[r.id] = r.full_name?.trim() || r.id
    }
    setNames(m)
  }, [post.id])

  useEffect(() => {
    if (commentsOpen) void loadComments()
  }, [commentsOpen, loadComments])

  async function togglePin() {
    setBusy('pin')
    const { error } = await supabase.from('campus_wall_posts').update({ pinned: !post.pinned }).eq('id', post.id)
    setBusy(null)
    if (!error) onChanged()
  }

  async function softDelete() {
    if (!window.confirm('أرشفة هذا المنشور؟')) return
    setBusy('del')
    const { error } = await supabase
      .from('campus_wall_posts')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', post.id)
    setBusy(null)
    if (!error) onChanged()
  }

  async function hidePost() {
    setBusy('hide')
    const { error } = await supabase.from('campus_wall_posts').update({ hidden_at: new Date().toISOString() }).eq('id', post.id)
    setBusy(null)
    if (!error) onChanged()
  }

  async function unhidePost() {
    setBusy('hide')
    const { error } = await supabase.from('campus_wall_posts').update({ hidden_at: null }).eq('id', post.id)
    setBusy(null)
    if (!error) onChanged()
  }

  async function setModeration(status: 'published' | 'rejected') {
    setBusy('mod')
    const { error } = await supabase.from('campus_wall_posts').update({ moderation_status: status }).eq('id', post.id)
    setBusy(null)
    if (!error) onChanged()
  }

  async function submitComment(e: React.FormEvent) {
    e.preventDefault()
    const t = commentBody.trim()
    if (!t) return
    setCommentErr(null)
    setBusy('comment')
    const { error } = await supabase.from('campus_wall_comments').insert({
      post_id: post.id,
      author_id: viewerId,
      body: t,
    })
    setBusy(null)
    if (error) setCommentErr(error.message)
    else {
      setCommentBody('')
      void loadComments()
    }
  }

  async function reportPost() {
    const reason = window.prompt('سبب البلاغ (اختياري):', '') ?? ''
    setBusy('report')
    const { error } = await insertCampusWallReport(supabase, post.id, viewerId, reason)
    setBusy(null)
    if (error) window.alert(error)
    else window.alert('تم تسجيل البلاغ.')
  }

  const imp = post.importance
  const borderAccent =
    imp === 'urgent'
      ? 'border-rose-300/90 dark:border-rose-800/60'
      : imp === 'high'
        ? 'border-amber-300/80 dark:border-amber-800/50'
        : 'border-slate-200/90 dark:border-slate-700/80'

  return (
    <article
      className={`rounded-2xl border bg-white/95 p-4 shadow-sm dark:bg-[#0f172a]/90 ${borderAccent}`}
      dir="rtl"
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100/90 pb-3 dark:border-slate-800/80">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            {post.pinned ? (
              <span className="rounded-lg bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-800 dark:bg-indigo-950/70 dark:text-indigo-200">
                مثبّت
              </span>
            ) : null}
            <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              {campusWallPostKindLabelAr(post.post_kind)}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">{campusWallImportanceLabelAr(imp)}</span>
            {post.moderation_status !== 'published' ? (
              <span className="rounded-lg bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900 dark:bg-amber-950/50 dark:text-amber-100">
                {post.moderation_status === 'pending' ? 'بانتظار الموافقة' : post.moderation_status === 'draft' ? 'مسودة' : 'مرفوض'}
              </span>
            ) : null}
          </div>
          {post.title?.trim() ? <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">{post.title.trim()}</h3> : null}
          <p className="text-sm text-slate-600 dark:text-slate-300">
            <span className="font-medium text-slate-800 dark:text-slate-100">{author?.full_name?.trim() || 'مستخدم'}</span>
            <span className="mx-1.5 text-slate-400">·</span>
            <span>{roleLabel}</span>
            <span className="mx-1.5 text-slate-400">·</span>
            <time dateTime={post.created_at}>{formatAppDateTime(post.created_at)}</time>
          </p>
          {(post.college?.name || post.group?.group_name) && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {post.college?.name ? <span>الكلية: {post.college.name}</span> : null}
              {post.college?.name && post.group?.group_name ? ' — ' : null}
              {post.group?.group_name ? <span>الفوج: {post.group.group_name}</span> : null}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {caps.is_admin && post.moderation_status === 'pending' ? (
            <>
              <button
                type="button"
                disabled={busy !== null}
                className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                onClick={() => void setModeration('published')}
              >
                قبول
              </button>
              <button
                type="button"
                disabled={busy !== null}
                className="rounded-lg bg-rose-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                onClick={() => void setModeration('rejected')}
              >
                رفض
              </button>
            </>
          ) : null}
          {(caps.is_admin || (isAuthor && caps.can_pin)) && post.moderation_status === 'published' ? (
            <button
              type="button"
              disabled={busy !== null}
              className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800/80"
              onClick={() => void togglePin()}
            >
              {post.pinned ? 'إلغاء التثبيت' : 'تثبيت'}
            </button>
          ) : null}
          {caps.is_admin && post.hidden_at ? (
            <button
              type="button"
              disabled={busy !== null}
              className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200"
              onClick={() => void unhidePost()}
            >
              إظهار
            </button>
          ) : null}
          {(caps.is_admin || canModerate) && !post.hidden_at && post.moderation_status === 'published' ? (
            <button
              type="button"
              disabled={busy !== null}
              className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200"
              onClick={() => void hidePost()}
            >
              إخفاء
            </button>
          ) : null}
          {(caps.is_admin || isAuthor || canModerate) && !post.deleted_at ? (
            <button
              type="button"
              disabled={busy !== null}
              className="rounded-lg border border-rose-200 px-2.5 py-1 text-xs font-medium text-rose-800 hover:bg-rose-50 dark:border-rose-900/60 dark:text-rose-200 dark:hover:bg-rose-950/30"
              onClick={() => void softDelete()}
            >
              أرشفة
            </button>
          ) : null}
          {!caps.is_admin && post.moderation_status === 'published' && !post.hidden_at ? (
            <button
              type="button"
              disabled={busy !== null}
              className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300"
              onClick={() => void reportPost()}
            >
              بلاغ
            </button>
          ) : null}
        </div>
      </header>
      <div className="prose prose-sm prose-slate mt-3 max-w-none dark:prose-invert">
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800 dark:text-slate-100">{post.body}</p>
      </div>
      {post.attachments?.length ? (
        <ul className="mt-3 space-y-1 rounded-xl bg-slate-50/80 p-3 text-sm dark:bg-slate-900/40">
          {post.attachments.map((a, i) => (
            <li key={`${a.url}-${i}`}>
              <a
                href={a.url}
                target="_blank"
                rel="noreferrer noopener"
                className="font-medium text-indigo-600 underline-offset-2 hover:underline dark:text-indigo-400"
              >
                {a.name?.trim() || 'مرفق'}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
      <footer className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800/80">
        <button
          type="button"
          className="text-xs font-semibold text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
          onClick={() => setCommentsOpen((o) => !o)}
        >
          {commentsOpen ? 'إخفاء التعليقات' : 'التعليقات'}
        </button>
        {commentsOpen ? (
          <div className="mt-3 space-y-3">
            <ul className="space-y-2">
              {comments.map((c) => (
                <li key={c.id} className="rounded-lg border border-slate-100 bg-slate-50/50 px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900/30">
                  <span className="font-medium text-slate-800 dark:text-slate-100">{names[c.author_id] || 'مستخدم'}</span>
                  <span className="mx-1.5 text-slate-400">·</span>
                  <time className="text-xs text-slate-500" dateTime={c.created_at}>
                    {formatAppDateTime(c.created_at)}
                  </time>
                  <p className="mt-1 whitespace-pre-wrap text-slate-700 dark:text-slate-300">{c.body}</p>
                </li>
              ))}
            </ul>
            {caps.can_comment && post.moderation_status === 'published' && !post.hidden_at ? (
              <form onSubmit={(e) => void submitComment(e)} className="space-y-2">
                <textarea
                  value={commentBody}
                  onChange={(e) => setCommentBody(e.target.value)}
                  rows={2}
                  placeholder="تعليقك…"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950/50"
                />
                {commentErr ? <p className="text-xs text-rose-600">{commentErr}</p> : null}
                <button
                  type="submit"
                  disabled={busy !== null || !commentBody.trim()}
                  className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-900 disabled:opacity-50 dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-white"
                >
                  إرسال
                </button>
              </form>
            ) : null}
          </div>
        ) : null}
      </footer>
    </article>
  )
}
