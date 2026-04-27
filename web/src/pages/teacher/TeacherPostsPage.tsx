import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { formatAppDateTime } from '../../lib/appDateTime'
import { fetchWorkspaceForTeacher } from '../../lib/workspace'
import type { Post } from '../../types'
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
import { CampusWallPostCard } from '../../components/campus-wall/CampusWallPostCard'
import { Loading } from '../../components/Loading'
import { ErrorBanner } from '../../components/ErrorBanner'
import { PageHeader } from '../../components/PageHeader'
import { EmptyState } from '../../components/EmptyState'

type AuthorProfile = { full_name: string | null; role: string }

type PostWithMeta = Post & {
  profiles?: AuthorProfile | AuthorProfile[] | null
  groups?: { group_name: string } | { group_name: string }[] | null
}

function singleAuthor(p: PostWithMeta['profiles']): AuthorProfile | null {
  if (p == null) return null
  if (Array.isArray(p)) {
    const x = p[0]
    return x && typeof x === 'object' && 'role' in x ? x : null
  }
  if (typeof p === 'object' && 'role' in p) return p as AuthorProfile
  return null
}

function singleGroup(g: PostWithMeta['groups']): { group_name: string } | null {
  if (g == null) return null
  if (Array.isArray(g)) return g[0] ?? null
  return g as { group_name: string }
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
  effective_role: 'teacher',
  is_admin: false,
}

function workspaceAuthorLabel(
  prof: AuthorProfile | null,
  authorId: string,
  uid: string,
  coordSet: Set<string>,
): string {
  if (authorId === uid) return 'أنت'
  if (!prof) return 'عضو'
  if (coordSet.has(authorId)) return 'منسق فوج'
  const r = prof.role
  if (r === 'teacher') return 'أستاذ'
  if (r === 'admin') return 'مدير'
  return 'طالب'
}

export function TeacherPostsPage() {
  const { session } = useAuth()
  const uid = session?.user?.id
  const [err, setErr] = useState<string | null>(null)
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)
  const [rows, setRows] = useState<PostWithMeta[]>([])
  const [loading, setLoading] = useState(true)

  const [wallTitle, setWallTitle] = useState<'حائط الجامعة' | 'حائط الكلية'>('حائط الجامعة')
  const [campusPosts, setCampusPosts] = useState<CampusWallPostWithRelations[]>([])
  const [campusErr, setCampusErr] = useState<string | null>(null)
  const [caps, setCaps] = useState<CampusWallCapabilities | null>(null)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editContent, setEditContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const reloadAll = useCallback(async () => {
    if (!uid) {
      setLoading(false)
      return
    }
    setLoading(true)
    setErr(null)
    setCampusErr(null)

    const nColleges = await fetchCampusWallCollegeCount(supabase)
    setWallTitle(campusWallTitleFromCollegeCount(nColleges))

    const [{ workspace, error: wErr }, { rows: cwRows, error: cwErr }, { caps: cwCaps }] = await Promise.all([
      fetchWorkspaceForTeacher(uid),
      fetchCampusWallPosts(supabase, { admin: false, filters: emptyCampusFilters }),
      fetchCampusWallCapabilities(supabase),
    ])

    setCampusErr(cwErr)
    setCaps(cwCaps)
    setCampusPosts((cwRows ?? []).slice(0, 40))

    if (wErr || !workspace) {
      setErr(wErr?.message ?? 'لم يُعثر على مساحة الأستاذ')
      setWorkspaceId(null)
      setRows([])
      setLoading(false)
      return
    }

    const wsId = workspace.id as string
    setWorkspaceId(wsId)

    const { data, error } = await supabase
      .from('posts')
      .select('*, profiles:profiles!posts_author_id_fkey(full_name, role), groups(group_name)')
      .eq('workspace_id', wsId)
      .is('deleted_at', null)
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false })

    setLoading(false)
    if (error) {
      setErr(error.message)
      setRows([])
      return
    }
    setRows((data as PostWithMeta[]) ?? [])
  }, [uid])

  useEffect(() => {
    void reloadAll()
  }, [reloadAll])

  const reloadCampusOnly = useCallback(async () => {
    const { rows: cwRows, error: cwErr } = await fetchCampusWallPosts(supabase, {
      admin: false,
      filters: emptyCampusFilters,
    })
    setCampusErr(cwErr)
    setCampusPosts((cwRows ?? []).slice(0, 40))
  }, [])

  const workspaceAuthorIds = useMemo(() => [...new Set(rows.map((r) => r.author_id))], [rows])
  const [coordSet, setCoordSet] = useState<Set<string>>(new Set())

  useEffect(() => {
    let ok = true
    ;(async () => {
      const cs = await fetchCoordinatorUserIds(supabase, workspaceAuthorIds)
      if (!ok) return
      setCoordSet(cs)
    })()
    return () => {
      ok = false
    }
  }, [workspaceAuthorIds])

  const campusAuthorIds = useMemo(() => [...new Set(campusPosts.map((p) => p.author_id))], [campusPosts])
  const [campusAuthorMap, setCampusAuthorMap] = useState<
    Record<string, { id: string; full_name: string; role: string }>
  >({})
  const [campusCoordSet, setCampusCoordSet] = useState<Set<string>>(new Set())

  useEffect(() => {
    let ok = true
    ;(async () => {
      const { map } = await fetchProfilesByIds(supabase, campusAuthorIds)
      const cs = await fetchCoordinatorUserIds(supabase, campusAuthorIds)
      if (!ok) return
      setCampusAuthorMap(map)
      setCampusCoordSet(cs)
    })()
    return () => {
      ok = false
    }
  }, [campusAuthorIds])

  const memberCaps = caps ?? defaultCaps

  function startEdit(p: PostWithMeta) {
    if (p.author_id !== uid) return
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
    await reloadAll()
  }

  async function hidePost(p: PostWithMeta) {
    if (!uid || p.author_id !== uid) return
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
    await reloadAll()
  }

  async function unhidePost(p: PostWithMeta) {
    if (!uid || !p.hidden_at || p.author_id !== uid) return
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
    await reloadAll()
  }

  if (!uid) return <Loading />

  const pinnedCampus = campusPosts.filter((p) => p.pinned)
  const restCampus = campusPosts.filter((p) => !p.pinned)

  return (
    <div className="page">
      <p className="breadcrumb">
        <Link to="/t">الرئيسية</Link> / المنشورات
      </p>
      <PageHeader
        title="المنشورات"
        subtitle={`${wallTitle} (عامّة للمنصة)، ثم كل منشورات مساحتك: ما تنشره أنت، وما ينشره زملاؤك الأساتذة، ومنشورات المنسقين والطلاب على حوائط الأفواج.`}
      />
      <ErrorBanner message={err} />
      <ErrorBanner message={campusErr} />

      <section className="section student-home__section" aria-label={wallTitle}>
        <div className="student-home__section-head">
          <h2>{wallTitle}</h2>
          <Link to="/t/campus-wall" className="btn btn--ghost btn--small">
            الصفحة الكاملة
          </Link>
        </div>
        <p className="muted small">إعلانات الجامعة والكلية والنشاطات المشتركة — ليست مقتصرة على فوج واحد.</p>
        {campusPosts.length === 0 ? (
          <p className="muted">لا توجد منشورات على {wallTitle} حالياً.</p>
        ) : (
          <div className="space-y-4">
            {pinnedCampus.length > 0 ? (
              <div>
                <h3 className="mb-2 text-sm font-semibold text-slate-600 dark:text-slate-400">مثبّتة</h3>
                <div className="space-y-3">
                  {pinnedCampus.map((p) => (
                    <CampusWallPostCard
                      key={p.id}
                      post={p}
                      author={campusAuthorMap[p.author_id]}
                      isCoordinator={campusCoordSet.has(p.author_id)}
                      caps={memberCaps}
                      viewerId={uid}
                      onChanged={() => void reloadCampusOnly()}
                    />
                  ))}
                </div>
              </div>
            ) : null}
            {restCampus.length > 0 ? (
              <div>
                {pinnedCampus.length > 0 ? (
                  <h3 className="mb-2 text-sm font-semibold text-slate-600 dark:text-slate-400">آخر المنشورات</h3>
                ) : null}
                <div className="space-y-3">
                  {restCampus.map((p) => (
                    <CampusWallPostCard
                      key={p.id}
                      post={p}
                      author={campusAuthorMap[p.author_id]}
                      isCoordinator={campusCoordSet.has(p.author_id)}
                      caps={memberCaps}
                      viewerId={uid}
                      onChanged={() => void reloadCampusOnly()}
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </section>

      <section className="section student-home__section" aria-label="منشورات المساحة">
        <div className="student-home__section-head">
          <h2>منشورات مساحتك</h2>
        </div>
        <p className="muted small">
          منشورات على مستوى المساحة أو على حائط فوج — من الأستاذ، أو منسق الفوج، أو الطالب عند السماح بالنشر.
        </p>
        {loading ? (
          <Loading label="جاري التحميل…" />
        ) : !workspaceId ? null : rows.length === 0 ? (
          <EmptyState title="لا منشورات في المساحة بعد" hint="انشر من صفحة فوج أو لكل الأفواج، أو انتظر نشاط المنسقين والطلاب." />
        ) : (
          <ul className="post-list">
            {rows.map((p) => {
              const prof = singleAuthor(p.profiles)
              const g = singleGroup(p.groups)
              const isOwn = p.author_id === uid
              const name =
                prof?.full_name?.trim() ||
                (prof?.role === 'teacher' ? 'أستاذ' : prof?.role === 'coordinator' ? 'منسق' : 'مؤلف المنشور')
              const roleLab = workspaceAuthorLabel(prof, p.author_id, uid!, coordSet)
              const isCohort = p.scope === 'group' && p.group_id != null

              return (
                <li
                  key={p.id}
                  className={`post-card ${isCohort ? 'post-card--cohort' : 'post-card--workspace-general'}`}
                >
                  {p.pinned ? <span className="pill">مثبت</span> : null}
                  {p.hidden_at ? (
                    <span className="pill" title="لا يراه إلا المؤلف والمراجِعون">
                      خفي
                    </span>
                  ) : null}
                  <span className="pill">{isCohort ? `فوج: ${g?.group_name ?? '—'}` : 'عام — المساحة'}</span>
                  <span className="pill">{roleLab}</span>
                  <p className="student-home__post-byline small">
                    <span className="student-home__post-byline-name">{name}</span>
                    <span className="muted" aria-hidden="true">
                      {' — '}
                    </span>
                    <time dateTime={p.created_at}>{formatAppDateTime(p.created_at)}</time>
                  </p>
                  {editingId === p.id && isOwn ? (
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
                      <p>{p.content.length > 400 ? `${p.content.slice(0, 400)}…` : p.content}</p>
                      <p className="muted small">
                        {p.scope === 'workspace' ? (
                          <>كل الأفواج</>
                        ) : (
                          <>
                            {g?.group_name ?? 'فوج'}{' '}
                            {p.group_id ? (
                              <>
                                · <Link to={`/t/groups/${p.group_id}`}>صفحة الفوج</Link>
                              </>
                            ) : null}
                          </>
                        )}
                      </p>
                      {isOwn ? (
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
                      ) : null}
                    </>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
