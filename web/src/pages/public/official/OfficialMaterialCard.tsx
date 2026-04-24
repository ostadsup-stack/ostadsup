import type { PublicMaterialRow } from '../../../types'
import { materialTypeLabelAr } from '../../../lib/officialPublicPage'
import { useMaterialSignedUrl } from '../../../hooks/useMaterialSignedUrl'

const LINK_KIND_LABEL: Record<string, string> = {
  seminar: 'ندوة',
  video: 'فيديو',
  link: 'رابط',
}

function SignedFileLink({ path, label }: { path: string; label: string }) {
  const { url } = useMaterialSignedUrl(path)
  if (!url) return <span className="muted small">جاري تجهيز الرابط…</span>
  return (
    <a href={url} target="_blank" rel="noreferrer noopener" className="btn btn--secondary btn--small" dir="ltr">
      {label}
    </a>
  )
}

function CoverImg({ path }: { path: string }) {
  const { url } = useMaterialSignedUrl(path)
  if (!url) return <div className="official-lib-card__cover official-lib-card__cover--ph" aria-hidden />
  return <img src={url} alt="" className="official-lib-card__cover" />
}

type Props = { m: PublicMaterialRow }

export function OfficialMaterialCard({ m }: Props) {
  const u = m.external_url?.trim()
  const href = u && /^https?:\/\//i.test(u) ? u : u ? `https://${u}` : null
  const kind = m.link_kind ? LINK_KIND_LABEL[m.link_kind] ?? m.link_kind : 'رابط'
  const isPublicFile = Boolean(m.file_path?.trim())
  const hasCover = Boolean(m.cover_path?.trim())

  return (
    <article className="official-lib-card">
      <div className="official-lib-card__top">
        {hasCover && m.cover_path ? <CoverImg path={m.cover_path} /> : <div className="official-lib-card__cover official-lib-card__cover--ph" aria-hidden />}
        <div className="official-lib-card__body">
          <span className="official-badge">{materialTypeLabelAr(m.material_type)}</span>
          <span className="muted small official-lib-card__group">{m.group_name}</span>
          <h3 className="official-lib-card__title">{m.title}</h3>
          {m.description?.trim() ? <p className="official-lib-card__desc">{m.description.trim()}</p> : null}
          {m.publication_year != null ? (
            <p className="muted small">سنة النشر: {m.publication_year}</p>
          ) : null}
          <div className="official-lib-card__actions">
            {m.material_type === 'reference' && href ? (
              <a href={href} target="_blank" rel="noreferrer noopener" className="btn btn--secondary btn--small" dir="ltr">
                {kind}: فتح الرابط
              </a>
            ) : null}
            {isPublicFile && m.file_path ? <SignedFileLink path={m.file_path} label="تحميل / عرض PDF" /> : null}
            {!isPublicFile && m.material_type !== 'reference' ? (
              <span className="muted small">
                الملف متاح لأعضاء الفوج بعد{' '}
                <a href="/login" className="official-link">
                  تسجيل الدخول
                </a>
                .
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  )
}
