import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { fetchWorkspaceForTeacher } from '../../lib/workspace'
import type { Post } from '../../types'
import { Loading } from '../../components/Loading'
import { ErrorBanner } from '../../components/ErrorBanner'
import { PageHeader } from '../../components/PageHeader'
import { EmptyState } from '../../components/EmptyState'

type PostRow = Post & { groups: { group_name: string } | null }

export function TeacherPostsPage() {
  const { session } = useAuth()
  const [err, setErr] = useState<string | null>(null)
  const [rows, setRows] = useState<PostRow[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editContent, setEditContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const reload = useCallback(async () => {
    const uid = session?.user?.id
    if (!uid) {
      setLoading(false)
      return
    }
    setLoading(true)
    setErr(null)
    const { workspace, error: wErr } = await fetchWorkspaceForTeacher(uid)
    if (wErr || !workspace) {
      setErr(wErr?.message ?? 'لم يُعثر على مساحة الأستاذ')
      setRows([])
      setLoading(false)
      return
    }
    const wsId = workspace.id as string
    const { data, error } = await supabase
      .from('posts')
      .select('*, groups(group_name)')
      .eq('workspace_id', wsId)
      .eq('author_id', uid)
      .is('deleted_at', null)
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false })
    setLoading(false)
    if (error) {
      setErr(error.message)
      setRows([])
      return
    }
    setRows((data as PostRow[]) ?? [])
  }, [session?.user?.id])

  useEffect(() => {
    void reload()
  }, [reload])

  function startEdit(p: PostRow) {
    setEditingId(p.id)
    setEditTitle(p.title?.trim() ?? '')
    setEditContent(p.content)
    setErr(null)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditTitle('')
    setEditContent('')
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault()
    const id = editingId
    const uid = session?.user?.id
    if (!id || !uid) return
    const trimmed = editContent.trim()
    if (!trimmed) {
      setErr('المحتوى لا يمكن أن يكون فارغاً')
      return
    }
    setSaving(true)
    setErr(null)
    const now = new Date().toISOString()
    const { error } = await supabase
      .from('posts')
      .update({
        title: editTitle.trim() || null,
        content: trimmed,
        updated_at: now,
      })
      .eq('id', id)
      .eq('author_id', uid)
    setSaving(false)
    if (error) {
      setErr(error.message)
      return
    }
    cancelEdit()
    await reload()
  }

  async function hidePost(p: PostRow) {
    const uid = session?.user?.id
    if (!uid) return
    if (
      !window.confirm(
        'إخفاء هذا المنشور؟ لن يراه الطلاب ولا الزائر؛ يبقى ظاهراً لك هنا فقط ويمكنك إعادة إظهاره لاحقاً.',
      )
    ) {
      return
    }
    setDeletingId(p.id)
    setErr(null)
    const now = new Date().toISOString()
    const { error } = await supabase
      .from('posts')
      .update({
        hidden_at: now,
        updated_at: now,
        is_public_on_site: false,
      })
      .eq('id', p.id)
      .eq('author_id', uid)
    setDeletingId(null)
    if (error) {
      setErr(error.message)
      return
    }
    if (editingId === p.id) cancelEdit()
    await reload()
  }

  async function unhidePost(p: PostRow) {
    const uid = session?.user?.id
    if (!uid || !p.hidden_at) return
    setDeletingId(p.id)
    setErr(null)
    const now = new Date().toISOString()
    const { error } = await supabase
      .from('posts')
      .update({ hidden_at: null, updated_at: now })
      .eq('id', p.id)
      .eq('author_id', uid)
    setDeletingId(null)
    if (error) {
      setErr(error.message)
      return
    }
    await reload()
  }

  if (!session?.user?.id) return <Loading />

  return (
    <div className="page">
      <p className="breadcrumb">
        <Link to="/t">الرئيسية</Link> / منشوراتي
      </p>
      <PageHeader
        title="منشوراتي"
        subtitle="كل منشوراتك في مساحتك. «إخفاء» يزيلها عن الطلاب والصفحة العامة دون حذفها نهائياً."
      />
      <ErrorBanner message={err} />
      {loading ? (
        <Loading label="جاري التحميل…" />
      ) : rows.length === 0 ? (
        <EmptyState title="لا منشورات بعد" hint="انشر من صفحة الفوج أو لكل الأفواج." />
      ) : (
        <ul className="post-list">
          {rows.map((p) => (
            <li key={p.id} className="post-card">
              {p.pinned ? <span className="pill">مثبت</span> : null}
              {p.hidden_at ? (
                <span className="pill" title="لا يراه إلا أنت">
                  خفي
                </span>
              ) : null}
              {editingId === p.id ? (
                <form className="form" onSubmit={(e) => void saveEdit(e)}>
                  <label>
                    العنوان (اختياري)
                    <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
                  </label>
                  <label>
                    المحتوى
                    <textarea
                      rows={5}
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      required
                    />
                  </label>
                  <div className="schedule-list__actions">
                    <button type="submit" className="btn btn--primary" disabled={saving}>
                      {saving ? 'جاري الحفظ…' : 'حفظ'}
                    </button>
                    <button type="button" className="btn btn--ghost" disabled={saving} onClick={cancelEdit}>
                      إلغاء
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  {p.title ? <h3>{p.title}</h3> : null}
                  <p>{p.content.slice(0, 280)}{p.content.length > 280 ? '…' : ''}</p>
                  <p className="muted small">
                    {p.scope === 'workspace' ? (
                      <>كل الأفواج</>
                    ) : (
                      <>{p.groups?.group_name ?? 'فوج'}</>
                    )}
                    {' · '}
                    {p.group_id ? <Link to={`/t/groups/${p.group_id}`}>الفوج</Link> : null}
                  </p>
                  <time className="muted small">{new Date(p.created_at).toLocaleString('ar-MA')}</time>
                  <div className="schedule-list__actions">
                    <button type="button" className="btn btn--ghost btn--small" onClick={() => startEdit(p)}>
                      تعديل
                    </button>
                    {p.hidden_at ? (
                      <button
                        type="button"
                        className="btn btn--ghost btn--small"
                        disabled={deletingId === p.id}
                        onClick={() => void unhidePost(p)}
                      >
                        {deletingId === p.id ? 'جاري التحديث…' : 'إظهار للطلاب'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn btn--ghost btn--small"
                        disabled={deletingId === p.id}
                        onClick={() => void hidePost(p)}
                      >
                        {deletingId === p.id ? 'جاري الإخفاء…' : 'إخفاء'}
                      </button>
                    )}
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
