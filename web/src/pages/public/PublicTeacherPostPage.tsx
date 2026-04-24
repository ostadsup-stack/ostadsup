import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { fetchWorkspaceForTeacher } from '../../lib/workspace'
import { supabase } from '../../lib/supabase'
import type { PublicPostRow, PublicTeacherPageRow } from '../../types'
import { Loading } from '../../components/Loading'
import { EmptyState } from '../../components/EmptyState'
import { OfficialShell } from './official/OfficialShell'
import { postTypeLabelAr } from '../../lib/officialPublicPage'

export function PublicTeacherPostPage() {
  const { slug, postId } = useParams<{ slug: string; postId: string }>()
  const { session, profile } = useAuth()
  const [isOwnerTeacher, setIsOwnerTeacher] = useState(false)
  const [teacher, setTeacher] = useState<PublicTeacherPageRow | null>(null)
  const [post, setPost] = useState<PublicPostRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    const s = slug?.trim()
    const pid = postId?.trim()
    if (!s || !pid) {
      setLoading(false)
      setPost(null)
      setTeacher(null)
      return
    }
    let ok = true
    setLoading(true)
    setErr(null)
    ;(async () => {
      const [tRes, pRes] = await Promise.all([
        supabase.rpc('public_teacher_by_workspace_slug', { p_slug: s }),
        supabase.rpc('public_workspace_post_by_slug_and_id', { p_slug: s, p_post_id: pid }),
      ])
      if (!ok) return
      if (tRes.error) {
        setErr(tRes.error.message)
        setTeacher(null)
        setPost(null)
        setLoading(false)
        return
      }
      const tlist = tRes.data as PublicTeacherPageRow[] | null
      setTeacher(tlist && tlist.length > 0 ? tlist[0] : null)
      if (pRes.error) {
        setErr(pRes.error.message)
        setPost(null)
        setLoading(false)
        return
      }
      const plist = pRes.data as PublicPostRow[] | null
      setPost(plist && plist.length > 0 ? plist[0] : null)
      setLoading(false)
    })()
    return () => {
      ok = false
    }
  }, [slug, postId])

  useEffect(() => {
    let ok = true
    const s = slug?.trim()
    const uid = session?.user?.id
    if (!s || !uid || profile?.role !== 'teacher') {
      setIsOwnerTeacher(false)
      return
    }
    ;(async () => {
      const { workspace } = await fetchWorkspaceForTeacher(uid)
      if (!ok) return
      setIsOwnerTeacher(workspace?.slug != null && String(workspace.slug) === s)
    })()
    return () => {
      ok = false
    }
  }, [slug, session?.user?.id, profile?.role])

  const slugTrim = slug?.trim() ?? ''
  const publicBrandHref = slugTrim ? `/p/${encodeURIComponent(slugTrim)}` : '/'

  if (loading) {
    return (
      <OfficialShell session={session} isOwnerTeacher={false} brandHref={publicBrandHref} profile={profile}>
        <div className="official-public__narrow">
          <Loading label="جاري التحميل…" />
        </div>
      </OfficialShell>
    )
  }

  if (err || !teacher) {
    return (
      <OfficialShell session={session} isOwnerTeacher={false} brandHref={publicBrandHref} profile={profile}>
        <div className="official-public__narrow">
          <EmptyState title="تعذّر التحميل" hint={err ?? '—'} />
        </div>
      </OfficialShell>
    )
  }

  if (!post) {
    return (
      <OfficialShell session={session} isOwnerTeacher={isOwnerTeacher} brandHref={publicBrandHref} profile={profile}>
        <div className="official-public__narrow">
          <EmptyState title="المنشور غير متاح" hint="قد يكون غير منشور للعموم أو غير موجود." />
          <p className="official-back-wrap">
            <Link to={`/p/${encodeURIComponent(slug!)}`} className="official-link">
              العودة إلى الصفحة الرسمية
            </Link>
          </p>
        </div>
      </OfficialShell>
    )
  }

  const s = slug!.trim()

  return (
    <OfficialShell session={session} isOwnerTeacher={isOwnerTeacher} brandHref={publicBrandHref} profile={profile}>
      <article className="official-card official-post-detail">
        <p className="official-back-wrap">
          <Link to={`/p/${encodeURIComponent(s)}`} className="official-link">
            ← {teacher.full_name}
          </Link>
        </p>
        <div className="official-post-detail__meta">
          <span className="official-badge">{postTypeLabelAr(post.post_type)}</span>
          {post.pinned ? <span className="official-badge official-badge--muted">مثبّت</span> : null}
        </div>
        {post.title?.trim() ? <h1 className="official-post-detail__title">{post.title.trim()}</h1> : null}
        <time className="muted small official-post-detail__time" dateTime={post.created_at}>
          {new Date(post.created_at).toLocaleDateString('ar-MA', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </time>
        <div className="official-post-detail__body">
          {post.content.split('\n').map((line, i) => (
            <p key={i}>{line || '\u00a0'}</p>
          ))}
        </div>
        {post.attachment_url?.trim() ? (
          <p className="official-post-detail__attach">
            <a href={post.attachment_url.trim()} target="_blank" rel="noreferrer noopener" className="btn btn--secondary btn--small" dir="ltr">
              فتح المرفق
            </a>
          </p>
        ) : null}
      </article>
    </OfficialShell>
  )
}
