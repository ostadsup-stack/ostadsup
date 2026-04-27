import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { formatAppDateTime } from '../../lib/appDateTime'
import type { Post } from '../../types'
import { cohortPageSurfaceStyle, normalizeGroupAccent } from '../../lib/groupTheme'
import { fetchActiveStudentMemberships, filterStudentRoleRows } from '../../lib/studentGroup'
import {
  campusWallTitleFromCollegeCount,
  fetchCampusWallCapabilities,
  fetchCampusWallCollegeCount,
  fetchCampusWallPosts,
  fetchCoordinatorUserIds,
  fetchProfilesByIds,
  type CampusWallCapabilities,
  type CampusWallPostFilters,
  type CampusWallPostWithRelations,
} from '../../lib/campusWall'
import { CampusWallComposer } from '../../components/campus-wall/CampusWallComposer'
import { CampusWallPostCard } from '../../components/campus-wall/CampusWallPostCard'
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

/** ترتيب العرض: أساتذة وإداريون → منسّقون → طلبة */
function feedAuthorTier(role: string | undefined | null, isCoordinatorMember: boolean): number {
  if (isCoordinatorMember || role === 'coordinator') return 2
  if (role === 'teacher' || role === 'admin') return 1
  return 3
}

function compareWallPosts(
  a: CampusWallPostWithRelations,
  b: CampusWallPostWithRelations,
  tierA: number,
  tierB: number,
): number {
  if (tierA !== tierB) return tierA - tierB
  if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
}

function compareCohortPosts(
  a: PostWithAuthor,
  b: PostWithAuthor,
  tierA: number,
  tierB: number,
): number {
  if (tierA !== tierB) return tierA - tierB
  if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
}

const emptyCampusFilters: CampusWallPostFilters = {
  collegeId: null,
  groupId: null,
  postKind: null,
  importance: null,
  moderation: 'all',
}

const defaultCaps: CampusWallCapabilities = {
  can_write: false,
  can_comment: false,
  can_pin: false,
  can_delete_any: false,
  effective_role: 'student',
  is_admin: false,
}

export function StudentPostsPage() {
  const { session } = useAuth()
  const uid = session?.user?.id
  const [err, setErr] = useState<string | null>(null)
  const [posts, setPosts] = useState<PostWithAuthor[]>([])
  const [cohortSurface, setCohortSurface] = useState<CSSProperties | null>(null)
  const [groupId, setGroupId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [wallTitle, setWallTitle] = useState<'حائط الجامعة' | 'حائط الكلية'>('حائط الجامعة')
  const [campusPosts, setCampusPosts] = useState<CampusWallPostWithRelations[]>([])
  const [campusErr, setCampusErr] = useState<string | null>(null)
  const [caps, setCaps] = useState<CampusWallCapabilities | null>(null)
  const [composerOpen, setComposerOpen] = useState(false)
  const [colleges, setColleges] = useState<{ id: string; name: string }[]>([])
  const [groups, setGroups] = useState<{ id: string; group_name: string; college_id: string | null }[]>([])

  useEffect(() => {
    let ok = true
    ;(async () => {
      const [{ data: c }, { data: g }] = await Promise.all([
        supabase.from('colleges').select('id, name').order('name'),
        supabase.from('groups').select('id, group_name, college_id').order('group_name').limit(400),
      ])
      if (!ok) return
      setColleges((c as { id: string; name: string }[]) ?? [])
      setGroups((g as { id: string; group_name: string; college_id: string | null }[]) ?? [])
    })()
    return () => {
      ok = false
    }
  }, [])

  useEffect(() => {
    let ok = true
    ;(async () => {
      if (!uid) {
        setLoading(false)
        return
      }
      setLoading(true)
      setErr(null)
      setCampusErr(null)

      const nColleges = await fetchCampusWallCollegeCount(supabase)
      const wallHeading = campusWallTitleFromCollegeCount(nColleges)

      const [{ rows: cwRows, error: cwErr }, { caps: cwCaps }] = await Promise.all([
        fetchCampusWallPosts(supabase, { admin: false, filters: emptyCampusFilters }),
        fetchCampusWallCapabilities(supabase),
      ])

      if (!ok) return
      setWallTitle(wallHeading)
      setCampusErr(cwErr)
      setCaps(cwCaps)
      setCampusPosts((cwRows ?? []).slice(0, 40))

      const { rows: memberRows, error: mErr } = await fetchActiveStudentMemberships(supabase, uid)
      if (!ok) return
      if (mErr) {
        setErr(mErr)
        setPosts([])
        setCohortSurface(null)
        setGroupId(null)
        setLoading(false)
        return
      }
      const students = filterStudentRoleRows(memberRows)
      const gid =
        students[0]?.group_id ??
        memberRows.find((r) => r.role_in_group === 'coordinator')?.group_id ??
        memberRows[0]?.group_id
      if (!gid || !memberRows[0]?.groups) {
        setErr(null)
        setPosts([])
        setCohortSurface(null)
        setGroupId(null)
        setLoading(false)
        return
      }
      const ws = memberRows.find((r) => r.group_id === gid)?.groups?.workspace_id
      if (!ws) {
        setErr('تعذر تحديد مساحة الفوج')
        setPosts([])
        setCohortSurface(null)
        setGroupId(null)
        setLoading(false)
        return
      }
      const accent = normalizeGroupAccent(memberRows.find((r) => r.group_id === gid)?.groups?.accent_color)
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
  }, [uid])

  const campusAuthorIds = useMemo(() => [...new Set(campusPosts.map((p) => p.author_id))], [campusPosts])
  const cohortAuthorIds = useMemo(() => [...new Set(posts.map((p) => p.author_id))].filter(Boolean), [posts])
  const wallAuthorIds = useMemo(
    () => [...new Set([...campusAuthorIds, ...cohortAuthorIds])],
    [campusAuthorIds, cohortAuthorIds],
  )

  const [authorMap, setAuthorMap] = useState<Record<string, { id: string; full_name: string; role: string }>>({})
  const [coordSet, setCoordSet] = useState<Set<string>>(new Set())

  useEffect(() => {
    let ok = true
    ;(async () => {
      const { map } = await fetchProfilesByIds(supabase, wallAuthorIds)
      const cs = await fetchCoordinatorUserIds(supabase, wallAuthorIds)
      if (!ok) return
      setAuthorMap(map)
      setCoordSet(cs)
    })()
    return () => {
      ok = false
    }
  }, [wallAuthorIds])

  const memberCaps = caps ?? defaultCaps

  const reloadCampusWall = useCallback(async () => {
    const { rows, error } = await fetchCampusWallPosts(supabase, { admin: false, filters: emptyCampusFilters })
    setCampusErr(error)
    setCampusPosts((rows ?? []).slice(0, 40))
  }, [])

  const sortedCampusPosts = useMemo(() => {
    const ranked = campusPosts.map((p) => ({
      post: p,
      tier: feedAuthorTier(authorMap[p.author_id]?.role, coordSet.has(p.author_id)),
    }))
    return [...ranked]
      .sort((x, y) => compareWallPosts(x.post, y.post, x.tier, y.tier))
      .map((x) => x.post)
  }, [campusPosts, authorMap, coordSet])

  const campusChunks = useMemo(() => {
    const order = [1, 2, 3] as const
    const titles: Record<number, string> = {
      1: 'من الأساتذة والإدارة',
      2: 'من المنسّقين',
      3: 'من الطلبة والمجتمع',
    }
    const m = new Map<number, CampusWallPostWithRelations[]>()
    for (const p of sortedCampusPosts) {
      const t = feedAuthorTier(authorMap[p.author_id]?.role, coordSet.has(p.author_id))
      if (!m.has(t)) m.set(t, [])
      m.get(t)!.push(p)
    }
    return order
      .filter((t) => (m.get(t)?.length ?? 0) > 0)
      .map((t) => ({ tier: t, title: titles[t], posts: m.get(t)! }))
  }, [sortedCampusPosts, authorMap, coordSet])

  const sortedCohortPosts = useMemo(() => {
    const ranked = posts.map((p) => {
      const prof = singleAuthorProfile(p.profiles)
      return {
        post: p,
        tier: feedAuthorTier(prof?.role, coordSet.has(p.author_id)),
      }
    })
    return [...ranked].sort((x, y) =>
      compareCohortPosts(x.post, y.post, x.tier, y.tier),
    ).map((x) => x.post)
  }, [posts, coordSet])

  const cohortChunks = useMemo(() => {
    const order = [1, 2, 3] as const
    const titles: Record<number, string> = {
      1: 'من الأساتذة والإدارة',
      2: 'من المنسّقين',
      3: 'من الطلبة في الفوج',
    }
    const m = new Map<number, PostWithAuthor[]>()
    for (const p of sortedCohortPosts) {
      const prof = singleAuthorProfile(p.profiles)
      const t = feedAuthorTier(prof?.role, coordSet.has(p.author_id))
      if (!m.has(t)) m.set(t, [])
      m.get(t)!.push(p)
    }
    return order
      .filter((t) => (m.get(t)?.length ?? 0) > 0)
      .map((t) => ({ tier: t, title: titles[t], posts: m.get(t)! }))
  }, [sortedCohortPosts, coordSet])

  if (loading) return <Loading />

  const hasCampus = campusPosts.length > 0
  const hasCohort = posts.length > 0

  return (
    <div className={cohortSurface ? 'page page--cohort' : 'page'} style={cohortSurface ?? undefined}>
      <PageHeader title="المنشورات" />
      <ErrorBanner message={err} />
      <ErrorBanner message={campusErr} />

      <section className="section student-home__section" aria-label={wallTitle}>
        <div className="student-home__section-head">
          <h2>{wallTitle}</h2>
          {memberCaps.can_write && uid ? (
            <button
              type="button"
              className="btn btn--ghost btn--small"
              onClick={() => setComposerOpen(true)}
            >
              منشور جديد
            </button>
          ) : null}
        </div>
        <p className="muted small">
          إعلانات الكلية والجامعة والمنصة — بنفس ترتيب العرض: الأساتذة والإدارة أولاً، ثم منسّقو الأفواج، ثم باقي
          المنشورات؛ داخل كل فئة يُعرض المنشور المثبّت ثم الأحدث.
        </p>
        {!hasCampus ? (
          <p className="muted">لا توجد منشورات على {wallTitle} حالياً.</p>
        ) : (
          <div className="space-y-8">
            {campusChunks.map((chunk) => (
              <div key={chunk.tier}>
                <h3 className="mb-3 text-sm font-semibold text-slate-600 dark:text-slate-400">{chunk.title}</h3>
                <div className="space-y-3">
                  {chunk.posts.map((p) => (
                    <CampusWallPostCard
                      key={p.id}
                      post={p}
                      author={authorMap[p.author_id]}
                      isCoordinator={coordSet.has(p.author_id)}
                      caps={memberCaps}
                      viewerId={uid!}
                      onChanged={() => void reloadCampusWall()}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="section student-home__section" aria-label="منشورات الفوج والمساحة">
        <div className="student-home__section-head">
          <h2>منشورات فوجك والمساحة</h2>
        </div>
        <p className="muted small">
          بعد قسم الحائط أعلاه: منشورات مساحة الأستاذ وفوجك — الأساتذة والإدارة أولاً، ثم المنسّقون، ثم الطلبة؛
          داخل كل فئة المنشور المثبّت ثم الأحدث.
        </p>
        {!groupId ? (
          <EmptyState
            title="لا منشورات للفوج بعد"
            hint={
              <>
                انضمّ إلى فوج للاطلاع على منشورات الأستاذ والمنسق، أو تابع أعلاه {wallTitle}.{' '}
                <Link to="/s/join">صفحة الانضمام</Link>.
              </>
            }
          />
        ) : !hasCohort ? (
          <p className="muted">لا منشورات من فوجك أو مساحة الأستاذ بعد.</p>
        ) : (
          <div className="space-y-8">
            {cohortChunks.map((chunk) => (
              <div key={chunk.tier}>
                <h3 className="mb-3 text-sm font-semibold text-slate-600 dark:text-slate-400">{chunk.title}</h3>
                <ul className="post-list">
                  {chunk.posts.map((p) => {
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
                          <time dateTime={p.created_at}>{formatAppDateTime(p.created_at)}</time>
                        </p>
                        {p.title ? <h4>{p.title}</h4> : null}
                        <p>{p.content}</p>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      {uid && memberCaps.can_write ? (
        <CampusWallComposer
          open={composerOpen}
          onClose={() => setComposerOpen(false)}
          onSaved={() => void reloadCampusWall()}
          userId={uid}
          isAdmin={false}
          colleges={colleges}
          groups={groups}
        />
      ) : null}
    </div>
  )
}
