import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import type { Post } from '../../types'
import { Loading } from '../../components/Loading'
import { ErrorBanner } from '../../components/ErrorBanner'
import { EmptyState } from '../../components/EmptyState'
import { PageHeader } from '../../components/PageHeader'

type WorkspaceRow = { id: string; display_name: string; slug: string }

type PostListRow = Post & {
  workspaces: { display_name: string; slug: string } | null
}

const emptyForm = {
  title: '',
  content: '',
  workspace_id: '',
  is_public_on_site: false,
}

export function AdminPostsPage() {
  const { session } = useAuth()
  const [workspaces, setWorkspaces] = useState<WorkspaceRow[]>([])
  const [rows, setRows] = useState<PostListRow[]>([])
  const [authorNames, setAuthorNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<PostListRow | null>(null)
  const [form, setForm] = useState(emptyForm)

  const loadAuthors = useCallback(async (list: PostListRow[]) => {
    const ids = [...new Set(list.map((p) => p.author_id).filter(Boolean))]
    if (ids.length === 0) {
      setAuthorNames({})
      return
    }
    const { data } = await supabase.from('profiles').select('id, full_name').in('id', ids)
    const map: Record<string, string> = {}
    for (const r of (data as { id: string; full_name: string }[]) ?? []) {
      map[r.id] = r.full_name?.trim() || r.id
    }
    setAuthorNames(map)
  }, [])

  const reload = useCallback(async () => {
    if (!session?.user?.id) {
      setRows([])
      return
    }
    setErr(null)
    setLoading(true)
    const { data: ws, error: wErr } = await supabase
      .from('workspaces')
      .select('id, display_name, slug')
      .order('display_name')
    if (wErr) {
      setErr(wErr.message)
      setWorkspaces([])
      setRows([])
      setLoading(false)
      return
    }
    setWorkspaces((ws as WorkspaceRow[]) ?? [])

    const { data, error } = await supabase
      .from('posts')
      .select('id, workspace_id, group_id, scope, title, content, created_at, updated_at, deleted_at, post_type, pinned, hidden_at, is_public_on_site, author_id, workspaces(display_name, slug)')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(200)
    if (error) {
      setErr(error.message)
      setRows([])
    } else {
      const raw = (data as Record<string, unknown>[]) ?? []
      const list: PostListRow[] = raw.map((row) => {
        const w = row.workspaces as PostListRow['workspaces'] | PostListRow['workspaces'][] | undefined
        const one = Array.isArray(w) ? w[0] ?? null : w ?? null
        return { ...(row as unknown as Post), workspaces: one } as PostListRow
      })
      setRows(list)
      void loadAuthors(list)
    }
    setLoading(false)
  }, [session?.user?.id, loadAuthors])

  useEffect(() => {
    void reload()
  }, [reload])

  function openCreate() {
    setEditing(null)
    setForm({
      ...emptyForm,
      workspace_id: workspaces[0]?.id ?? '',
    })
    setShowModal(true)
    setErr(null)
  }

  function openEdit(p: PostListRow) {
    setEditing(p)
    setForm({
      title: p.title?.trim() ?? '',
      content: p.content,
      workspace_id: p.workspace_id,
      is_public_on_site: Boolean(p.is_public_on_site),
    })
    setShowModal(true)
    setErr(null)
  }

  function closeModal() {
    setShowModal(false)
    setEditing(null)
    setForm(emptyForm)
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.content.trim()) {
      setErr('المحتوى مطلوب.')
      return
    }
    if (!form.workspace_id) {
      setErr('اختر المساحة.')
      return
    }
    if (!session?.user?.id) return
    setSaving(true)
    setErr(null)
    const now = new Date().toISOString()
    if (editing) {
      const { error } = await supabase
        .from('posts')
        .update({
          title: form.title.trim() || null,
          content: form.content.trim(),
          updated_at: now,
          is_public_on_site: editing.scope === 'workspace' && !editing.group_id ? form.is_public_on_site : false,
        })
        .eq('id', editing.id)
      setSaving(false)
      if (error) setErr(error.message)
      else {
        closeModal()
        void reload()
      }
      return
    }
    const { error } = await supabase.from('posts').insert({
      workspace_id: form.workspace_id,
      group_id: null,
      scope: 'workspace',
      author_id: session.user.id,
      post_type: 'general',
      title: form.title.trim() || null,
      content: form.content.trim(),
      pinned: false,
      is_public_on_site: form.is_public_on_site,
    })
    setSaving(false)
    if (error) setErr(error.message)
    else {
      closeModal()
      void reload()
    }
  }

  async function onSoftDelete(p: PostListRow) {
    if (!window.confirm('إخفاء/أرشفة هذا المنشور (لن يظهر للمستخدمين)؟')) return
    setDeleting(p.id)
    setErr(null)
    const { error } = await supabase
      .from('posts')
      .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', p.id)
    setDeleting(null)
    if (error) setErr(error.message)
    else void reload()
  }

  if (loading) return <Loading label="جاري تحميل المنشورات…" />

  return (
    <div className="page">
      <PageHeader
        title="المنشورات والإعلانات"
        subtitle="منشورات على مستوى المساحة. التاريخ مأخوذ تلقائياً من وقت الإنشاء/آخر تعديل."
      />
      <ErrorBanner message={err} />

      <div className="admin-cohorts__toolbar">
        <button type="button" className="btn btn--primary" onClick={() => openCreate()}>
          إنشاء منشور
        </button>
      </div>

      {rows.length === 0 ? (
        <section className="section">
          <EmptyState title="لا منشورات" hint="أنشئ أول منشوراً مربوطاً بمساحة أستاذ." />
        </section>
      ) : (
        <section className="section">
          <div className="admin-cohorts__table-wrap" role="region" aria-label="قائمة المنشورات">
            <table className="admin-table admin-table--posts">
              <thead>
                <tr>
                  <th>العنوان</th>
                  <th>المساحة</th>
                  <th>المؤلّف</th>
                  <th>التاريخ</th>
                  <th className="admin-table__actions">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id}>
                    <td data-label="العنوان">
                      <strong className="admin-posts__title-clamp">{p.title?.trim() || '— بدون عنوان —'}</strong>
                      <p className="admin-posts__excerpt muted small">{p.content.slice(0, 100)}{p.content.length > 100 ? '…' : ''}</p>
                    </td>
                    <td className="muted" data-label="المساحة">
                      {p.workspaces?.display_name ?? p.workspace_id}
                    </td>
                    <td data-label="المؤلّف">{authorNames[p.author_id] ?? '…'}</td>
                    <td className="muted small" data-label="التاريخ" title={p.created_at}>
                      {new Date(p.created_at).toLocaleString('ar-MA', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </td>
                    <td className="admin-table__actions">
                      <div className="admin-cohorts__row-actions">
                        <button
                          type="button"
                          className="btn btn--secondary btn--small"
                          onClick={() => openEdit(p)}
                        >
                          تعديل
                        </button>
                        <button
                          type="button"
                          className="btn btn--ghost btn--small"
                          disabled={deleting === p.id}
                          onClick={() => void onSoftDelete(p)}
                        >
                          {deleting === p.id ? '…' : 'حذف'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {showModal ? (
        <div
          className="admin-modal-backdrop"
          role="presentation"
          onClick={(e) => e.target === e.currentTarget && closeModal()}
        >
          <div className="admin-modal admin-modal--wide" role="dialog" aria-modal="true" aria-labelledby="admin-post-modal-title">
            <h2 id="admin-post-modal-title" className="admin-modal__title">
              {editing ? 'تعديل منشور' : 'إنشاء منشور'}
            </h2>
            <form className="form form--grid" onSubmit={(e) => void onSubmit(e)}>
              {!editing ? (
                <label className="span-2">
                  المساحة
                  <select
                    value={form.workspace_id}
                    onChange={(e) => setForm({ ...form, workspace_id: e.target.value })}
                    required
                    disabled={workspaces.length === 0}
                  >
                    {workspaces.length === 0 ? <option value="">لا توجد مساحات</option> : null}
                    {workspaces.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.display_name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label className="span-2">
                العنوان
                <input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="اختياري"
                />
              </label>
              <label className="span-2">
                المحتوى
                <textarea
                  required
                  rows={6}
                  value={form.content}
                  onChange={(e) => setForm({ ...form, content: e.target.value })}
                />
              </label>
              {!editing || (editing.scope === 'workspace' && !editing.group_id) ? (
                <label className="span-2">
                  <span className="admin-posts__checkbox">
                    <input
                      type="checkbox"
                      checked={form.is_public_on_site}
                      onChange={(e) => setForm({ ...form, is_public_on_site: e.target.checked })}
                    />
                    إظهار في الصفحة العامة للأستاذ (منشور مساحة)
                  </span>
                </label>
              ) : null}
              <div className="admin-modal__actions">
                <button type="button" className="btn btn--ghost" onClick={closeModal} disabled={saving}>
                  إلغاء
                </button>
                <button type="submit" className="btn btn--primary" disabled={saving || (!editing && workspaces.length === 0)}>
                  {saving ? 'جاري الحفظ…' : editing ? 'حفظ' : 'نشر'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  )
}
