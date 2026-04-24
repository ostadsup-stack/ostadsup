import type { AcademicProfile } from '../../../types'
import type { PublicTeacherPageRow } from '../../../types'
import { whatsappHref } from '../../../lib/whatsapp'

type ContactVis = Record<'phone' | 'whatsapp' | 'email' | 'social' | 'office_hours', boolean>

const SOCIAL_LABELS: Record<string, string> = {
  linkedin: 'LinkedIn',
  facebook: 'Facebook',
  twitter: 'X / Twitter',
  website: 'الموقع',
}

type Props = {
  row: PublicTeacherPageRow
  academic: AcademicProfile
  contactVisible: ContactVis
}

export function OfficialHero({ row, academic, contactVisible }: Props) {
  const initial = row.full_name?.trim().charAt(0) || '?'
  const wa = row.whatsapp?.trim() ? whatsappHref(row.whatsapp.trim()) : null
  const rank = academic.rankTitle?.trim()
  const inst = academic.institution?.trim() || row.workspace_display_name
  const email = row.public_contact_email?.trim()
  const social =
    row.social_links && typeof row.social_links === 'object' && !Array.isArray(row.social_links)
      ? (row.social_links as Record<string, string>)
      : {}

  return (
    <header className="official-card official-hero">
      <div className="official-hero__grid">
        <div className="official-hero__avatar-wrap">
          {row.avatar_url ? (
            <img src={row.avatar_url} alt="" className="official-hero__avatar" />
          ) : (
            <div className="official-hero__avatar official-hero__avatar--ph" aria-hidden>
              {initial}
            </div>
          )}
        </div>
        <div className="official-hero__text">
          <h1 className="official-hero__name">{row.full_name}</h1>
          {rank ? <p className="official-hero__rank">{rank}</p> : null}
          {row.specialty?.trim() ? <p className="official-hero__specialty">{row.specialty.trim()}</p> : null}
          <p className="official-hero__institution">{inst}</p>
          {row.bio?.trim() ? <p className="official-hero__bio">{row.bio.trim()}</p> : null}
          <div className="official-hero__actions">
            {contactVisible.email && email ? (
              <a className="btn btn--secondary btn--small" href={`mailto:${email}`} dir="ltr">
                البريد
              </a>
            ) : null}
            {contactVisible.phone && row.phone?.trim() ? (
              <a className="btn btn--secondary btn--small" href={`tel:${row.phone.replace(/\s/g, '')}`} dir="ltr">
                هاتف
              </a>
            ) : null}
            {contactVisible.whatsapp && wa ? (
              <a className="btn btn--primary btn--small" href={wa} target="_blank" rel="noreferrer noopener">
                واتساب
              </a>
            ) : null}
            {row.cv_path ? (
              <a className="btn btn--ghost btn--small" href={row.cv_path} target="_blank" rel="noreferrer noopener">
                السيرة الذاتية (PDF)
              </a>
            ) : null}
          </div>
          {contactVisible.social && Object.keys(social).some((k) => social[k]?.trim()) ? (
            <ul className="official-hero__social">
              {Object.entries(social).map(([key, url]) => {
                const u = url?.trim()
                if (!u) return null
                const href = /^https?:\/\//i.test(u) ? u : `https://${u}`
                return (
                  <li key={key}>
                    <a href={href} target="_blank" rel="noreferrer noopener" className="official-hero__social-link">
                      {SOCIAL_LABELS[key] ?? key}
                    </a>
                  </li>
                )
              })}
            </ul>
          ) : null}
        </div>
      </div>
    </header>
  )
}
