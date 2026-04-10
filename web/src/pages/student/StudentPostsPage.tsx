import { useEffect, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import type { Post } from '../../types'
import { cohortPageSurfaceStyle, normalizeGroupAccent } from '../../lib/groupTheme'
import { fetchActiveStudentMemberships, filterStudentRoleRows } from '../../lib/studentGroup'
import { Loading } from '../../components/Loading'
import { ErrorBanner } from '../../components/ErrorBanner'
import { EmptyState } from '../../components/EmptyState'
import { PageHeader } from '../../components/PageHeader'

export function StudentPostsPage() {
  const { session } = useAuth()
  const [err, setErr] = useState<string | null>(null)
  const [posts, setPosts] = useState<Post[]>([])
  const [cohortSurface, setCohortSurface] = useState<CSSProperties | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let ok = true
    ;(async () => {
      if (!session?.user?.id) {
        setLoading(false)
        return
      }
      setLoading(true)
      const { rows, error: mErr } = await fetchActiveStudentMemberships(supabase, session.user.id)
      if (!ok) return
      if (mErr) {
        setErr(mErr)
        setPosts([])
        setCohortSurface(null)
        setLoading(false)
        return
      }
      const students = filterStudentRoleRows(rows)
      const gid =
        students[0]?.group_id ?? rows.find((r) => r.role_in_group === 'coordinator')?.group_id ?? rows[0]?.group_id
      if (!gid || !rows[0]?.groups) {
        setErr(null)
        setPosts([])
        setCohortSurface(null)
        setLoading(false)
        return
      }
      const ws = rows.find((r) => r.group_id === gid)?.groups?.workspace_id
      if (!ws) {
        setErr('تعذر تحديد مساحة الفوج')
        setPosts([])
        setCohortSurface(null)
        setLoading(false)
        return
      }
      const accent = normalizeGroupAccent(rows.find((r) => r.group_id === gid)?.groups?.accent_color)
      setCohortSurface(cohortPageSurfaceStyle(accent))
      const { data, error } = await supabase
        .from('posts')
        .select('*')
        .eq('workspace_id', ws)
        .is('deleted_at', null)
        .or(`group_id.eq.${gid},scope.eq.workspace`)
        .order('pinned', { ascending: false })
        .order('created_at', { ascending: false })
      if (!ok) return
      setErr(error?.message ?? null)
      setPosts((data as Post[]) ?? [])
      setLoading(false)
    })()
    return () => {
      ok = false
    }
  }, [session?.user?.id])

  if (loading) return <Loading />

  return (
    <div className={cohortSurface ? 'page page--cohort' : 'page'} style={cohortSurface ?? undefined}>
      <PageHeader title="منشورات الأساتذة" subtitle="منشورات الحائط الخاصة بفوجك ومساحة الأستاذ." />
      <ErrorBanner message={err} />
      {posts.length === 0 ? (
        <EmptyState
          title="لا منشورات"
          hint={
            <>
              انضمّ إلى فوج أو انتقل إلى{' '}
              <Link to="/s/join">صفحة الانضمام</Link>.
            </>
          }
        />
      ) : (
        <ul className="post-list">
          {posts.map((p) => (
            <li key={p.id} className="post-card">
              {p.pinned ? <span className="pill">مثبت</span> : null}
              <span className="pill">{p.scope === 'workspace' ? 'عام' : 'الفوج'}</span>
              {p.title ? <h4>{p.title}</h4> : null}
              <p>{p.content}</p>
              <time className="muted">{new Date(p.created_at).toLocaleString('ar-MA')}</time>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
