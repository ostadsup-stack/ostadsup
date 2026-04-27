import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
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
  CAMPUS_WALL_POST_KINDS,
  campusWallPostKindLabelAr,
} from '../lib/campusWall'
import { CampusWallPostCard } from '../components/campus-wall/CampusWallPostCard'
import { CampusWallComposer } from '../components/campus-wall/CampusWallComposer'
import { PageHeader } from '../components/PageHeader'
import { ErrorBanner } from '../components/ErrorBanner'

type CampusWallMemberPageProps = {
  homeLink: string
}

export function CampusWallMemberPage({ homeLink }: CampusWallMemberPageProps) {
  const { session } = useAuth()
  const uid = session?.user?.id
  const [wallTitle, setWallTitle] = useState<'حائط الجامعة' | 'حائط الكلية'>('حائط الجامعة')
  const [posts, setPosts] = useState<CampusWallPostWithRelations[]>([])
  const [postsErr, setPostsErr] = useState<string | null>(null)
  const [loadingPosts, setLoadingPosts] = useState(true)
  const [colleges, setColleges] = useState<{ id: string; name: string }[]>([])
  const [groups, setGroups] = useState<{ id: string; group_name: string; college_id: string | null }[]>([])
  const [caps, setCaps] = useState<CampusWallCapabilities | null>(null)
  const [composerOpen, setComposerOpen] = useState(false)
  const [filters, setFilters] = useState<CampusWallPostFilters>({
    collegeId: null,
    groupId: null,
    postKind: null,
    importance: null,
    moderation: 'all',
  })

  const reloadPosts = useCallback(async () => {
    setLoadingPosts(true)
    setPostsErr(null)
    const { rows, error } = await fetchCampusWallPosts(supabase, { admin: false, filters })
    setPosts(rows)
    setPostsErr(error)
    setLoadingPosts(false)
  }, [filters])

  useEffect(() => {
    void (async () => {
      const n = await fetchCampusWallCollegeCount(supabase)
      setWallTitle(campusWallTitleFromCollegeCount(n))
    })()
  }, [])

  useEffect(() => {
    void reloadPosts()
  }, [reloadPosts])

  useEffect(() => {
    void (async () => {
      const [{ data: c }, { data: g }, { caps: cps }] = await Promise.all([
        supabase.from('colleges').select('id, name').order('name'),
        supabase.from('groups').select('id, group_name, college_id').order('group_name').limit(400),
        fetchCampusWallCapabilities(supabase),
      ])
      setColleges((c as { id: string; name: string }[]) ?? [])
      setGroups((g as { id: string; group_name: string; college_id: string | null }[]) ?? [])
      setCaps(cps)
    })()
  }, [])

  const authorIds = useMemo(() => [...new Set(posts.map((p) => p.author_id))], [posts])
  const [authorMap, setAuthorMap] = useState<Record<string, { id: string; full_name: string; role: string }>>({})
  const [coordSet, setCoordSet] = useState<Set<string>>(new Set())

  useEffect(() => {
    let ok = true
    ;(async () => {
      const { map } = await fetchProfilesByIds(supabase, authorIds)
      const cs = await fetchCoordinatorUserIds(supabase, authorIds)
      if (!ok) return
      setAuthorMap(map)
      setCoordSet(cs)
    })()
    return () => {
      ok = false
    }
  }, [authorIds])

  const memberCaps: CampusWallCapabilities = caps ?? {
    can_write: false,
    can_comment: false,
    can_pin: false,
    can_delete_any: false,
    effective_role: '',
    is_admin: false,
  }

  const pinned = posts.filter((p) => p.pinned)
  const rest = posts.filter((p) => !p.pinned)
  const multiCollege = colleges.length > 1 && !filters.collegeId
  const restByCollege = useMemo(() => {
    if (!multiCollege) return null
    const m = new Map<string | null, CampusWallPostWithRelations[]>()
    for (const p of rest) {
      const k = p.college_id
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(p)
    }
    return [...m.entries()].sort((a, b) => {
      if (a[0] == null && b[0] != null) return -1
      if (a[0] != null && b[0] == null) return 1
      const na = a[1][0]?.college?.name ?? ''
      const nb = b[1][0]?.college?.name ?? ''
      return na.localeCompare(nb, 'ar')
    })
  }, [rest, multiCollege])

  return (
    <div className="page mx-auto max-w-3xl space-y-5" dir="rtl">
      <PageHeader title={wallTitle} subtitle="إعلانات وتنبيهات أكاديمية من إدارة المنصة والمجتمع الأكاديمي." />
      <Link
        to={homeLink}
        className="inline-block text-sm font-medium text-slate-500 underline decoration-slate-400/40 underline-offset-2 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
      >
        ← الرئيسية
      </Link>

      <div className="grid gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 dark:border-slate-700 dark:bg-slate-900/30 sm:grid-cols-2 lg:grid-cols-3">
        <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
          الكلية
          <select
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-2 py-2 text-sm dark:border-slate-600 dark:bg-slate-950/50"
            value={filters.collegeId ?? ''}
            onChange={(e) =>
              setFilters((f) => ({
                ...f,
                collegeId: e.target.value || null,
                groupId: null,
              }))
            }
          >
            <option value="">كل الكليات</option>
            {colleges.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
          الفوج
          <select
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-2 py-2 text-sm dark:border-slate-600 dark:bg-slate-950/50"
            value={filters.groupId ?? ''}
            onChange={(e) => setFilters((f) => ({ ...f, groupId: e.target.value || null }))}
          >
            <option value="">كل الأفواج</option>
            {(filters.collegeId ? groups.filter((g) => g.college_id === filters.collegeId) : groups).map((g) => (
              <option key={g.id} value={g.id}>
                {g.group_name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
          نوع المنشور
          <select
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-2 py-2 text-sm dark:border-slate-600 dark:bg-slate-950/50"
            value={filters.postKind ?? ''}
            onChange={(e) =>
              setFilters((f) => ({
                ...f,
                postKind: (e.target.value || null) as CampusWallPostFilters['postKind'],
              }))
            }
          >
            <option value="">كل الأنواع</option>
            {CAMPUS_WALL_POST_KINDS.map((k) => (
              <option key={k} value={k}>
                {campusWallPostKindLabelAr(k)}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
          الأهمية
          <select
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-2 py-2 text-sm dark:border-slate-600 dark:bg-slate-950/50"
            value={filters.importance ?? ''}
            onChange={(e) =>
              setFilters((f) => ({
                ...f,
                importance: (e.target.value || null) as CampusWallPostFilters['importance'],
              }))
            }
          >
            <option value="">كل المستويات</option>
            <option value="normal">عادي</option>
            <option value="high">مهم</option>
            <option value="urgent">عاجل</option>
          </select>
        </label>
      </div>

      {memberCaps.can_write && uid ? (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setComposerOpen(true)}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
          >
            منشور جديد
          </button>
        </div>
      ) : null}

      <ErrorBanner message={postsErr} />

      {loadingPosts ? (
        <p className="text-center text-sm text-slate-500">جاري التحميل…</p>
      ) : posts.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500 dark:border-slate-700">
          لا توجد منشورات منشورة حالياً.
        </p>
      ) : (
        <div className="space-y-4">
          {pinned.length > 0 ? (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-slate-600 dark:text-slate-300">مثبّتة</h3>
              <div className="space-y-3">
                {pinned.map((p) => (
                  <CampusWallPostCard
                    key={p.id}
                    post={p}
                    author={authorMap[p.author_id]}
                    isCoordinator={coordSet.has(p.author_id)}
                    caps={memberCaps}
                    viewerId={uid!}
                    onChanged={() => void reloadPosts()}
                  />
                ))}
              </div>
            </div>
          ) : null}
          {rest.length > 0 ? (
            <div className="space-y-6">
              {pinned.length > 0 ? <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300">الأحدث</h3> : null}
              {restByCollege ? (
                restByCollege.map(([collegeId, chunk]) => (
                  <div key={collegeId ?? 'none'}>
                    <h4 className="mb-2 border-r-4 border-sky-500/80 pr-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                      {collegeId == null ? 'عام — بدون كلية محددة' : chunk[0]?.college?.name ?? 'كلية'}
                    </h4>
                    <div className="space-y-3">
                      {chunk.map((p) => (
                        <CampusWallPostCard
                          key={p.id}
                          post={p}
                          author={authorMap[p.author_id]}
                          isCoordinator={coordSet.has(p.author_id)}
                          caps={memberCaps}
                          viewerId={uid!}
                          onChanged={() => void reloadPosts()}
                        />
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                <div className="space-y-3">
                  {rest.map((p) => (
                    <CampusWallPostCard
                      key={p.id}
                      post={p}
                      author={authorMap[p.author_id]}
                      isCoordinator={coordSet.has(p.author_id)}
                      caps={memberCaps}
                      viewerId={uid!}
                      onChanged={() => void reloadPosts()}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}

      {uid && memberCaps.can_write ? (
        <CampusWallComposer
          open={composerOpen}
          onClose={() => setComposerOpen(false)}
          onSaved={() => void reloadPosts()}
          userId={uid}
          isAdmin={false}
          colleges={colleges}
          groups={groups}
        />
      ) : null}
    </div>
  )
}
