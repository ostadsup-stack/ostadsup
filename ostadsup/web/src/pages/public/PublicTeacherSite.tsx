import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { fetchWorkspaceForTeacher } from '../../lib/workspace'
import { supabase } from '../../lib/supabase'
import { whatsappHref } from '../../lib/whatsapp'
import type { PublicMaterialRow, PublicPostRow } from '../../types'
import { Loading } from '../../components/Loading'
import { EmptyState } from '../../components/EmptyState'

type PublicRow = {
  workspace_display_name: string
  workspace_slug: string
  full_name: string
  specialty: string | null
  bio: string | null
  avatar_url: string | null
  phone: string | null
  whatsapp: string | null
  office_hours: string | null
  social_links: Record<string, string> | null
  cv_path: string | null
}

const SOCIAL_LABELS: Record<string, string> = {
  linkedin: 'LinkedIn',
  facebook: 'Facebook',
  twitter: 'X / Twitter',
  website: 'الموقع',
}

const LINK_KIND_LABEL: Record<string, string> = {
  seminar: 'ندوة',
  video: 'فيديو',
  link: 'رابط',
}

function excerpt(text: string, maxLen: number) {
  const t = text.replace(/\s+/g, ' ').trim()
  if (t.length <= maxLen) return t
  return `${t.slice(0, maxLen).trim()}…`
}

export function PublicTeacherSite() {
  const { slug } = useParams<{ slug: string }>()
  const { session, profile } = useAuth()
  const [isOwnerTeacher, setIsOwnerTeacher] = useState(false)
  const [row, setRow] = useState<PublicRow | null>(null)
  const [materials, setMaterials] = useState<PublicMaterialRow[]>([])
  const [posts, setPosts] = useState<PublicPostRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!slug?.trim()) {
      setErr(null)
      setRow(null)
      setMaterials([])
      setPosts([])
      setLoading(false)
      return
    }
    let ok = true
    setLoading(true)
    setErr(null)
    ;(async () => {
      const s = slug.trim()
      const [profRes, matRes, postRes] = await Promise.all([
        supabase.rpc('public_teacher_by_workspace_slug', { p_slug: s }),
        supabase.rpc('public_workspace_materials_by_slug', { p_slug: s }),
        supabase.rpc('public_workspace_posts_by_slug', { p_slug: s }),
      ])
      if (!ok) return
      if (profRes.error) {
        setErr(profRes.error.message)
        setRow(null)
        setMaterials([])
        setPosts([])
        setLoading(false)
        return
      }
      const list = profRes.data as PublicRow[] | null
      setRow(list && list.length > 0 ? list[0] : null)
      setMaterials(matRes.error ? [] : ((matRes.data as PublicMaterialRow[]) ?? []))
      setPosts(postRes.error ? [] : ((postRes.data as PublicPostRow[]) ?? []))
      setLoading(false)
    })()
    return () => {
      ok = false
    }
  }, [slug])

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
      const mine = workspace?.slug != null && String(workspace.slug) === s
      setIsOwnerTeacher(mine)
    })()
    return () => {
      ok = false
    }
  }, [slug, session?.user?.id, profile?.role])

  if (loading) {
    return (
      <div className="layout layout--public">
        <header className="header header--simple">
          <Link to="/" className="header__brand">
            Ostadi
          </Link>
        </header>
        <main className="main main--narrow main--public">
          <Loading label="جاري التحميل…" />
        </main>
      </div>
    )
  }

  if (err) {
    return (
      <div className="layout layout--public">
        <header className="header header--simple">
          <Link to="/" className="header__brand">
            Ostadi
          </Link>
        </header>
        <main className="main main--narrow main--public">
          <EmptyState title="تعذّر التحميل" hint={err} />
        </main>
      </div>
    )
  }

  if (!row) {
    return (
      <div className="layout layout--public">
        <header className="header header--simple">
          <Link to="/" className="header__brand">
            Ostadi
          </Link>
        </header>
        <main className="main main--narrow main--public">
          <EmptyState title="الصفحة غير موجودة" hint="تحقق من الرابط أو معرف المساحة (slug)." />
        </main>
      </div>
    )
  }

  const wa = row.whatsapp?.trim() ? whatsappHref(row.whatsapp.trim()) : null
  const social = row.social_links && typeof row.social_links === 'object' ? row.social_links : {}
  const initial = row.full_name?.trim().charAt(0) || '?'

  const books = materials.filter((m) => m.material_type === 'book')
  const lessons = materials.filter((m) => m.material_type === 'lesson')
  const refs = materials.filter((m) => m.material_type === 'reference')

  return (
    <div className="layout layout--public public-teacher">
      <header className="header header--simple public-teacher__topbar">
        <Link to="/" className="header__brand">
          Ostadi
        </Link>
        {isOwnerTeacher ? (
          <Link to="/t" className="btn btn--ghost">
            لوحة التحكم
          </Link>
        ) : session ? (
          <Link to="/t" className="btn btn--ghost">
            حسابي
          </Link>
        ) : (
          <Link to="/login" className="btn btn--ghost">
            دخول
          </Link>
        )}
      </header>
      <main className="main main--public public-teacher__main">
        <article className="public-teacher__card">
          <div className="public-teacher__hero">
            <div className="public-teacher__avatar-wrap">
              {row.avatar_url ? (
                <img src={row.avatar_url} alt="" className="public-teacher__avatar" />
              ) : (
                <div className="public-teacher__avatar public-teacher__avatar--ph" aria-hidden>
                  {initial}
                </div>
              )}
            </div>
            <div className="public-teacher__headline">
              <h1 className="public-teacher__name">{row.full_name}</h1>
              {row.specialty ? <p className="public-teacher__specialty">{row.specialty}</p> : null}
              <p className="muted public-teacher__workspace">{row.workspace_display_name}</p>
            </div>
          </div>

          {row.bio ? <p className="public-teacher__bio">{row.bio}</p> : null}

          {(books.length > 0 || lessons.length > 0 || refs.length > 0) && (
            <section className="public-teacher__block public-teacher__library" aria-labelledby="public-library-h">
              <h2 id="public-library-h" className="public-teacher__h2">
                مكتبة المساحة
              </h2>
              {books.length > 0 ? (
                <div className="public-teacher__library-group">
                  <h3 className="public-teacher__h3">كتب إلكترونية</h3>
                  <ul className="public-teacher__library-list">
                    {books.map((m) => (
                      <li key={m.id} className="public-teacher__library-item">
                        <span className="public-teacher__library-title">{m.title}</span>
                        <span className="muted small public-teacher__library-meta">{m.group_name}</span>
                        <span className="public-teacher__library-hint muted small">
                          الملف يُتاح لأعضاء الفوج بعد{' '}
                          <Link to="/login" className="teacher-home__inline-link">
                            تسجيل الدخول
                          </Link>
                          .
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {lessons.length > 0 ? (
                <div className="public-teacher__library-group">
                  <h3 className="public-teacher__h3">مواد علمية</h3>
                  <ul className="public-teacher__library-list">
                    {lessons.map((m) => (
                      <li key={m.id} className="public-teacher__library-item">
                        <span className="public-teacher__library-title">{m.title}</span>
                        <span className="muted small public-teacher__library-meta">{m.group_name}</span>
                        <span className="public-teacher__library-hint muted small">
                          الملف يُتاح لأعضاء الفوج بعد{' '}
                          <Link to="/login" className="teacher-home__inline-link">
                            تسجيل الدخول
                          </Link>
                          .
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {refs.length > 0 ? (
                <div className="public-teacher__library-group">
                  <h3 className="public-teacher__h3">روابط علمية</h3>
                  <ul className="public-teacher__library-list">
                    {refs.map((m) => {
                      const u = m.external_url?.trim()
                      const href = u && /^https?:\/\//i.test(u) ? u : u ? `https://${u}` : null
                      const kind = m.link_kind ? LINK_KIND_LABEL[m.link_kind] ?? m.link_kind : 'رابط'
                      return (
                        <li key={m.id} className="public-teacher__library-item">
                          <span className="pill pill--seminar public-teacher__ref-pill">{kind}</span>
                          {href ? (
                            <a
                              href={href}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="public-teacher__library-link"
                              dir="ltr"
                            >
                              {m.title}
                            </a>
                          ) : (
                            <span className="public-teacher__library-title">{m.title}</span>
                          )}
                          <span className="muted small public-teacher__library-meta">{m.group_name}</span>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ) : null}
            </section>
          )}

          {posts.length > 0 ? (
            <section className="public-teacher__block" aria-labelledby="public-posts-h">
              <h2 id="public-posts-h" className="public-teacher__h2">
                منشورات المساحة
              </h2>
              <ul className="public-teacher__posts">
                {posts.map((p) => (
                  <li key={p.id} className="public-teacher__post">
                    {p.pinned ? <span className="public-teacher__post-pin">مثبّت</span> : null}
                    {p.title?.trim() ? <h3 className="public-teacher__post-title">{p.title.trim()}</h3> : null}
                    <p className="public-teacher__post-body">{excerpt(p.content, 400)}</p>
                    <time className="muted small public-teacher__post-time" dateTime={p.created_at}>
                      {new Date(p.created_at).toLocaleDateString('ar-MA', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </time>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="public-teacher__block public-teacher__contact" aria-labelledby="public-contact-h">
            <h2 id="public-contact-h" className="public-teacher__h2">
              تواصل
            </h2>
            <div className="public-teacher__actions">
              {row.phone?.trim() ? (
                <a className="btn btn--secondary" href={`tel:${row.phone.replace(/\s/g, '')}`} dir="ltr">
                  اتصال
                </a>
              ) : null}
              {wa ? (
                <a className="btn btn--primary" href={wa} target="_blank" rel="noreferrer noopener">
                  واتساب
                </a>
              ) : null}
              {row.cv_path ? (
                <a className="btn btn--ghost" href={row.cv_path} target="_blank" rel="noreferrer noopener">
                  السيرة الذاتية (PDF)
                </a>
              ) : null}
            </div>

            {row.office_hours?.trim() ? (
              <>
                <h3 className="public-teacher__h3 public-teacher__contact-sub">أوقات التواصل</h3>
                <p className="public-teacher__office">{row.office_hours}</p>
              </>
            ) : null}

            {Object.keys(social).some((k) => social[k]?.trim()) ? (
              <>
                <h3 className="public-teacher__h3 public-teacher__contact-sub">روابط</h3>
                <ul className="public-teacher__social">
                  {Object.entries(social).map(([key, url]) => {
                    const u = url?.trim()
                    if (!u) return null
                    const href = /^https?:\/\//i.test(u) ? u : `https://${u}`
                    return (
                      <li key={key}>
                        <a href={href} target="_blank" rel="noreferrer noopener">
                          {SOCIAL_LABELS[key] ?? key}
                        </a>
                      </li>
                    )
                  })}
                </ul>
              </>
            ) : null}
          </section>

          <p className="muted small public-teacher__footer-note">
            صفحة عامة على منصة Ostadi — المحتوى من مسؤولية الأستاذ.
          </p>
        </article>
      </main>
    </div>
  )
}
