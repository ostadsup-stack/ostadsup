import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import type { Post } from '../../types'
import { Loading } from '../../components/Loading'
import { ErrorBanner } from '../../components/ErrorBanner'
import { EmptyState } from '../../components/EmptyState'
import { PageHeader } from '../../components/PageHeader'

type PostRow = Post & {
  is_published?: boolean
  workspaces: { display_name: string; slug: string } | null
}

function normalizeRows(data: Record<string, unknown>[]): PostRow[] {
  return data.map((row) => {
    const w = row.workspaces as PostRow['workspaces'] | PostRow['workspaces'][] | undefined
    const one = Array.isArray(w) ? w[0] ?? null : w ?? null
    return { ...(row as unknown as Post), workspaces: one } as PostRow
  })
}

export function AdminContentPage() {
  const { session } = useAuth()
  const [rows, setRows] = useState<PostRow[]>([])
  const [authorNames, setAuthorNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [busyAction, setBusyAction] = useState<'delete' | 'publish' | null>(null)

  const loadAuthors = useCallback(async (list: PostRow[]) => {
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
      setLoading(false)
      return
    }
    setErr(null)
    setLoading(true)
    const { data, error } = await supabase
      .from('posts')
      .select(
        'id, workspace_id, group_id, scope, title, content, created_at, updated_at, deleted_at, post_type, pinned, hidden_at, is_public_on_site, is_published, author_id, workspaces(display_name, slug)',
      )
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(500)

    if (error) {
      setErr(error.message)
      setRows([])
    } else {
      const raw = (data as Record<string, unknown>[]) ?? []
      const list = normalizeRows(raw)
      setRows(list)
      void loadAuthors(list)
    }
    setLoading(false)
  }, [session?.user?.id, loadAuthors])

  useEffect(() => {
    void reload()
  }, [reload])

  async function onSoftDelete(p: PostRow) {
    if (!window.confirm('حذف هذا المنشور؟ سيُخفى عن الجميع (حذف ناعم).')) return
    setBusyId(p.id)
    setBusyAction('delete')
    setErr(null)
    const now = new Date().toISOString()
    const { error } = await supabase
      .from('posts')
      .update({ deleted_at: now, updated_at: now })
      .eq('id', p.id)
    setBusyId(null)
    setBusyAction(null)
    if (error) setErr(error.message)
    else void reload()
  }

  async function onSetPublished(p: PostRow, published: boolean) {
    setBusyId(p.id)
    setBusyAction('publish')
    setErr(null)
    const now = new Date().toISOString()
    const { error } = await supabase
      .from('posts')
      .update({ is_published: published, updated_at: now })
      .eq('id', p.id)
    setBusyId(null)
    setBusyAction(null)
    if (error) setErr(error.message)
    else setRows((prev) => prev.map((r) => (r.id === p.id ? { ...r, is_published: published } : r)))
  }

  if (loading) return <Loading label="جاري تحميل المنشورات…" />

  return (
    <div className="page">
      <PageHeader
        title="إدارة المحتوى"
        subtitle="كل المنشورات (مساحة وفوج) غير المحذوفة. يمكن إلغاء النشر لإخفاء المنشور عن الأعضاء مع بقائه للمؤلف، أو حذفه ناعماً."
      />
      <ErrorBanner message={err} />

      <p className="muted admin-content-page__links">
        روابط سريعة:{' '}
        <Link to="/admin/posts">تحرير منشورات المساحة</Link>
        {' · '}
        <Link to="/admin/messages">الرسائل</Link>
        {' · '}
        <Link to="/admin/invitations">الدعوات</Link>
      </p>

      {rows.length === 0 ? (
        <section className="section">
          <EmptyState title="لا منشورات" hint="لا توجد منشورات نشطة في النظام." />
        </section>
      ) : (
        <section className="section">
          <div className="admin-cohorts__table-wrap" role="region" aria-label="كل المنشورات">
            <table className="admin-table admin-table--posts">
              <thead>
                <tr>
                  <th>العنوان</th>
                  <th>النطاق</th>
                  <th>المساحة</th>
                  <th>النشر</th>
                  <th>المؤلّف</th>
                  <th>التاريخ</th>
                  <th className="admin-table__actions">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const published = p.is_published !== false
                  const busy = busyId === p.id
                  return (
                    <tr key={p.id}>
                      <td data-label="العنوان">
                        <strong className="admin-posts__title-clamp">
                          {p.title?.trim() || '— بدون عنوان —'}
                        </strong>
                        <p className="admin-posts__excerpt muted small">
                          {p.content.slice(0, 80)}
                          {p.content.length > 80 ? '…' : ''}
                        </p>
                      </td>
                      <td data-label="النطاق">
                        {p.scope === 'group' ? (
                          <span className="pill">فوج</span>
                        ) : (
                          <span className="pill pill--ok">مساحة</span>
                        )}
                      </td>
                      <td className="muted" data-label="المساحة">
                        {p.workspaces?.display_name ?? p.workspace_id}
                      </td>
                      <td data-label="النشر">
                        {published ? (
                          <span className="pill pill--ok">منشور</span>
                        ) : (
                          <span className="pill">غير منشور</span>
                        )}
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
                          {published ? (
                            <button
                              type="button"
                              className="btn btn--ghost btn--small"
                              disabled={busy && busyAction === 'publish'}
                              onClick={() => void onSetPublished(p, false)}
                            >
                              {busy && busyAction === 'publish' ? '…' : 'إلغاء النشر'}
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn btn--secondary btn--small"
                              disabled={busy && busyAction === 'publish'}
                              onClick={() => void onSetPublished(p, true)}
                            >
                              {busy && busyAction === 'publish' ? '…' : 'نشر'}
                            </button>
                          )}
                          <button
                            type="button"
                            className="btn btn--ghost btn--small"
                            disabled={busy && busyAction === 'delete'}
                            onClick={() => void onSoftDelete(p)}
                          >
                            {busy && busyAction === 'delete' ? '…' : 'حذف'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
