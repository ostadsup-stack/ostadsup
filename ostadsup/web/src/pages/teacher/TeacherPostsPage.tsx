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

  if (!session?.user?.id) return <Loading />

  return (
    <div className="page">
      <p className="breadcrumb">
        <Link to="/t">الرئيسية</Link> / منشوراتي
      </p>
      <PageHeader title="منشوراتي" subtitle="كل منشوراتك في مساحتك." />
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
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
