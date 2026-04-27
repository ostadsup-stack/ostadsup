import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { formatAppDateTime } from '../../lib/appDateTime'
import type { Material } from '../../types'
import { cohortPageSurfaceStyle, normalizeGroupAccent } from '../../lib/groupTheme'
import { fetchActiveStudentMemberships, filterStudentRoleRows } from '../../lib/studentGroup'
import {
  fetchStudentMaterialsFeed,
  materialAuthorName,
  postAuthorName,
  type MaterialWithCreator,
  type PeerPostRow,
} from '../../lib/studentMaterialsData'
import { Loading } from '../../components/Loading'
import { ErrorBanner } from '../../components/ErrorBanner'
import { EmptyState } from '../../components/EmptyState'
import { PageHeader } from '../../components/PageHeader'

function materialKindAr(m: Material): string {
  switch (m.material_type) {
    case 'book':
      return 'كتاب'
    case 'lesson':
      return 'درس'
    case 'reference':
      return 'مرجع'
    default:
      return m.material_type
  }
}

type PeerFeedItem =
  | { kind: 'material'; ts: string; material: MaterialWithCreator }
  | { kind: 'post'; ts: string; post: PeerPostRow }

export function StudentMaterialsPage() {
  const { session } = useAuth()
  const [err, setErr] = useState<string | null>(null)
  const [teacherMaterials, setTeacherMaterials] = useState<MaterialWithCreator[]>([])
  const [peerMaterials, setPeerMaterials] = useState<MaterialWithCreator[]>([])
  const [peerPosts, setPeerPosts] = useState<PeerPostRow[]>([])
  const [groupId, setGroupId] = useState<string | null>(null)
  const [cohortSurface, setCohortSurface] = useState<CSSProperties | null>(null)
  const [loading, setLoading] = useState(true)

  const peerFeed = useMemo(() => {
    const items: PeerFeedItem[] = [
      ...peerMaterials.map((m) => ({ kind: 'material' as const, ts: m.created_at, material: m })),
      ...peerPosts.map((p) => ({ kind: 'post' as const, ts: p.created_at, post: p })),
    ]
    items.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
    return items
  }, [peerMaterials, peerPosts])

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
        setTeacherMaterials([])
        setPeerMaterials([])
        setPeerPosts([])
        setGroupId(null)
        setCohortSurface(null)
        setLoading(false)
        return
      }
      const students = filterStudentRoleRows(rows)
      const gid =
        students[0]?.group_id ?? rows.find((r) => r.role_in_group === 'coordinator')?.group_id ?? rows[0]?.group_id
      if (!gid) {
        setErr(null)
        setTeacherMaterials([])
        setPeerMaterials([])
        setPeerPosts([])
        setGroupId(null)
        setCohortSurface(null)
        setLoading(false)
        return
      }
      setGroupId(gid)
      const accent = normalizeGroupAccent(rows.find((r) => r.group_id === gid)?.groups?.accent_color)
      setCohortSurface(cohortPageSurfaceStyle(accent))

      const bundle = await fetchStudentMaterialsFeed(supabase, gid)
      if (!ok) return
      setErr(bundle.error)
      setTeacherMaterials(bundle.teacherMaterials)
      setPeerMaterials(bundle.peerMaterials)
      setPeerPosts(bundle.peerPosts)
      setLoading(false)
    })()
    return () => {
      ok = false
    }
  }, [session?.user?.id])

  async function openMaterialFile(m: MaterialWithCreator) {
    if (!m.file_path) return
    const { data, error } = await supabase.storage.from('materials').createSignedUrl(m.file_path, 3600)
    if (error) {
      setErr(error.message)
      return
    }
    if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  function openMaterial(m: MaterialWithCreator) {
    if (m.material_type === 'reference' && m.external_url?.trim()) {
      const u = m.external_url.trim()
      try {
        const url = new URL(u)
        if (url.protocol === 'http:' || url.protocol === 'https:') {
          window.open(url.href, '_blank', 'noopener,noreferrer')
          return
        }
      } catch {
        /* fall through */
      }
    }
    void openMaterialFile(m)
  }

  if (loading) return <Loading />

  const hasGroup = Boolean(groupId)
  const hasTeacherBlock = teacherMaterials.length > 0
  const hasPeerBlock = peerFeed.length > 0

  return (
    <div className={cohortSurface ? 'page page--cohort' : 'page'} style={cohortSurface ?? undefined}>
      <PageHeader
        title="المواد"
        subtitle="أعلى: مكتبة الأساتذة الذين يدرّسون فوجك. أسفل: منشورات ودروس رفعها المنسق أو الطلاب في الفوج — يظهر دائماً اسم الناشر وتاريخ النشر."
      />
      <ErrorBanner message={err} />

      {!hasGroup ? (
        <EmptyState
          title="لا فوج مرتبط"
          hint={
            <>
              انضمّ إلى فوج من{' '}
              <Link to="/s/join">صفحة الانضمام</Link>.
            </>
          }
        />
      ) : (
        <>
          <section className="section student-materials__block" aria-labelledby="student-mat-teachers-heading">
            <h2 id="student-mat-teachers-heading">مكتبة أساتذة الفوج</h2>
            <p className="muted small">
              كل المواد العلمية (كتب، دروس، مراجع) المنشورة في مكتبة الأساتذة الذين يدرّسون هذا الفوج، أو المرفوعة
              للفوج من قبلهم.
            </p>
            {!hasTeacherBlock ? (
              <p className="muted">لا مواد في المكتبة بعد.</p>
            ) : (
              <ul className="post-list">
                {teacherMaterials.map((m) => {
                  const isLibrary = m.audience_scope === 'workspace_public' && m.group_id == null
                  return (
                    <li
                      key={m.id}
                      className={`post-card ${isLibrary ? 'post-card--workspace-general' : 'post-card--cohort'}`}
                    >
                      <span className="pill">{materialKindAr(m)}</span>
                      {isLibrary ? <span className="pill">مكتبة المساحة</span> : <span className="pill">الفوج</span>}
                      <p className="student-home__post-byline small">
                        <span className="student-home__post-byline-name">{materialAuthorName(m)}</span>
                        <span className="muted" aria-hidden="true">
                          {' — '}
                        </span>
                        <time dateTime={m.created_at}>{formatAppDateTime(m.created_at)}</time>
                      </p>
                      <h4 className="student-materials__title">{m.title}</h4>
                      {m.description?.trim() ? <p className="muted small">{m.description.trim()}</p> : null}
                      <p className="student-materials__actions">
                        {m.file_path || (m.material_type === 'reference' && m.external_url?.trim()) ? (
                          <button type="button" className="btn btn--secondary btn--small" onClick={() => openMaterial(m)}>
                            فتح / تحميل
                          </button>
                        ) : (
                          <span className="muted small">لا ملفاً مرفقاً</span>
                        )}
                      </p>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          <section className="section student-materials__block" aria-labelledby="student-mat-peers-heading">
            <h2 id="student-mat-peers-heading">من الطلاب والمنسقين</h2>
            <p className="muted small">
              منشورات الحائط ودروس أو ملفات رفعها منسقو الفوج أو الطلاب فيما بينهم (لا يشمل ما نشره الأساتذة في
              المكتبة أعلاه).
            </p>
            {!hasPeerBlock ? (
              <p className="muted">لا منشورات أو مواد من المنسقين والطلاب بعد.</p>
            ) : (
              <ul className="post-list">
                {peerFeed.map((item) =>
                  item.kind === 'material' ? (
                    <li key={`m-${item.material.id}`} className="post-card post-card--cohort">
                      <span className="pill">{materialKindAr(item.material)}</span>
                      <span className="pill">مادة</span>
                      <p className="student-home__post-byline small">
                        <span className="student-home__post-byline-name">{materialAuthorName(item.material)}</span>
                        <span className="muted" aria-hidden="true">
                          {' — '}
                        </span>
                        <time dateTime={item.material.created_at}>
                          {formatAppDateTime(item.material.created_at)}
                        </time>
                      </p>
                      <h4 className="student-materials__title">{item.material.title}</h4>
                      {item.material.description?.trim() ? (
                        <p className="muted small">{item.material.description.trim()}</p>
                      ) : null}
                      <p className="student-materials__actions">
                        {item.material.file_path ||
                        (item.material.material_type === 'reference' && item.material.external_url?.trim()) ? (
                          <button
                            type="button"
                            className="btn btn--secondary btn--small"
                            onClick={() => openMaterial(item.material)}
                          >
                            فتح / تحميل
                          </button>
                        ) : (
                          <span className="muted small">لا ملفاً مرفقاً</span>
                        )}
                      </p>
                    </li>
                  ) : (
                    <li key={`p-${item.post.id}`} className="post-card post-card--cohort">
                      <span className="pill">منشور</span>
                      <p className="student-home__post-byline small">
                        <span className="student-home__post-byline-name">{postAuthorName(item.post)}</span>
                        <span className="muted" aria-hidden="true">
                          {' — '}
                        </span>
                        <time dateTime={item.post.created_at}>
                          {formatAppDateTime(item.post.created_at)}
                        </time>
                      </p>
                      {item.post.title?.trim() ? (
                        <h4 className="student-materials__title">{item.post.title.trim()}</h4>
                      ) : null}
                      <p>
                        {item.post.content.length > 280 ? `${item.post.content.slice(0, 280)}…` : item.post.content}
                      </p>
                      {groupId ? (
                        <p className="student-materials__actions">
                          <Link className="btn btn--ghost btn--small" to={`/s/groups/${groupId}`}>
                            صفحة الفوج
                          </Link>
                        </p>
                      ) : null}
                    </li>
                  ),
                )}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  )
}
