import { Link } from 'react-router-dom'
import type { PublicPostRow } from '../../../types'
import { excerpt, postTypeLabelAr } from '../../../lib/officialPublicPage'

type Props = { slug: string; posts: PublicPostRow[] }

export function OfficialPosts({ slug, posts }: Props) {
  if (posts.length === 0) return null
  return (
    <section className="official-card official-section" aria-labelledby="official-posts-h">
      <h2 id="official-posts-h" className="official-section__title">
        المنشورات العامة
      </h2>
      <ul className="official-post-grid">
        {posts.map((p) => (
          <li key={p.id} className="official-post-card">
            <div className="official-post-card__meta">
              <span className="official-badge">{postTypeLabelAr(p.post_type)}</span>
              {p.pinned ? <span className="official-badge official-badge--muted">مثبّت</span> : null}
            </div>
            {p.title?.trim() ? <h3 className="official-post-card__title">{p.title.trim()}</h3> : null}
            <p className="official-post-card__excerpt">{excerpt(p.content, 220)}</p>
            <time className="official-post-card__time" dateTime={p.created_at}>
              {new Date(p.created_at).toLocaleDateString('ar-MA', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              })}
            </time>
            <div className="official-post-card__foot">
              {p.attachment_url?.trim() ? (
                <a
                  href={p.attachment_url.trim()}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="official-link"
                  dir="ltr"
                >
                  مرفق
                </a>
              ) : null}
              <Link to={`/p/${encodeURIComponent(slug)}/posts/${p.id}`} className="btn btn--ghost btn--small">
                التفاصيل
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
