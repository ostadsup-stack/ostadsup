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

type AuthorProfile = { full_name: string | null; role: string }

type PostWithAuthor = Post & {
  profiles?: AuthorProfile | AuthorProfile[] | null
}

function singleAuthorProfile(p: PostWithAuthor['profiles']): AuthorProfile | null {
  if (p == null) return null
  if (Array.isArray(p)) {
    const x = p[0]
    return x && typeof x === 'object' && 'role' in x ? x : null
  }
  if (typeof p === 'object' && 'role' in p) return p as AuthorProfile
  return null
}

export function StudentPostsPage() {
  const { session } = useAuth()
  const [err, setErr] = useState<string | null>(null)
  const [posts, setPosts] = useState<PostWithAuthor[]>([])
  const [cohortSurface, setCohortSurface] = useState<CSSProperties | null>(null)
  const [groupId, setGroupId] = useState<string | null>(null)
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
        setGroupId(null)
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
        setGroupId(null)
        setLoading(false)
        return
      }
      const ws = rows.find((r) => r.group_id === gid)?.groups?.workspace_id
      if (!ws) {
        setErr('تعذر تحديد مساحة الفوج')
        setPosts([])
        setCohortSurface(null)
        setGroupId(null)
        setLoading(false)
        return
      }
      const accent = normalizeGroupAccent(rows.find((r) => r.group_id === gid)?.groups?.accent_color)
      setCohortSurface(cohortPageSurfaceStyle(accent))
      setGroupId(gid)
      const { data, error } = await supabase
        .from('posts')
        .select('*, profiles:profiles!posts_author_id_fkey(full_name, role)')
        .eq('workspace_id', ws)
        .is('deleted_at', null)
        .or(`group_id.eq.${gid},scope.eq.workspace`)
        .order('pinned', { ascending: false })
        .order('created_at', { ascending: false })
      if (!ok) return
      setErr(error?.message ?? null)
      setPosts((data as PostWithAuthor[]) ?? [])
      setLoading(false)
    })()
    return () => {
      ok = false
    }
  }, [session?.user?.id])

  if (loading) return <Loading />

  return (
    <div className={cohortSurface ? 'page page--cohort' : 'page'} style={cohortSurface ?? undefined}>
      <PageHeader
        title="منشورات"
        subtitle="منشورات وإعلانات الأساتذة والمنسقين: خاصة بالفوج مميّزة بلون الفوج، والمنشورات العامة للمساحة بلون مختلف. يظهر دائماً اسم الناشر وتاريخ النشر."
      />
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
          {posts.map((p) => {
            const prof = singleAuthorProfile(p.profiles)
            const name =
              prof?.full_name?.trim() ||
              (prof?.role === 'teacher' ? 'أستاذ' : prof?.role === 'coordinator' ? 'منسق' : 'مؤلف المنشور')
            const isCohort = p.scope === 'group' && p.group_id != null && p.group_id === groupId
            return (
              <li
                key={p.id}
                className={`post-card ${isCohort ? 'post-card--cohort' : 'post-card--workspace-general'}`}
              >
                {p.pinned ? <span className="pill">مثبت</span> : null}
                <span className="pill">{isCohort ? 'الفوج' : 'عام'}</span>
                <p className="student-home__post-byline small">
                  <span className="student-home__post-byline-name">{name}</span>
                  <span className="muted" aria-hidden="true">
                    {' — '}
                  </span>
                  <time dateTime={p.created_at}>{new Date(p.created_at).toLocaleString('ar-MA')}</time>
                </p>
                {p.title ? <h4>{p.title}</h4> : null}
                <p>{p.content}</p>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
