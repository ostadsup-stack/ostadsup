import { Link } from 'react-router-dom'
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
  contactVisible: ContactVis
}

export function OfficialContact({ row, contactVisible }: Props) {
  const wa = row.whatsapp?.trim() ? whatsappHref(row.whatsapp.trim()) : null
  const email = row.public_contact_email?.trim()
  const social =
    row.social_links && typeof row.social_links === 'object' && !Array.isArray(row.social_links)
      ? (row.social_links as Record<string, string>)
      : {}

  return (
    <section className="official-card official-section" aria-labelledby="official-contact-h">
      <h2 id="official-contact-h" className="official-section__title">
        التواصل
      </h2>
      <div className="official-contact__actions">
        <Link to="/login" className="btn btn--primary btn--small">
          إرسال رسالة عبر المنصة
        </Link>
        {contactVisible.email && email ? (
          <a className="btn btn--secondary btn--small" href={`mailto:${email}`} dir="ltr">
            البريد الإلكتروني
          </a>
        ) : null}
        {contactVisible.phone && row.phone?.trim() ? (
          <a className="btn btn--secondary btn--small" href={`tel:${row.phone.replace(/\s/g, '')}`} dir="ltr">
            اتصال
          </a>
        ) : null}
        {contactVisible.whatsapp && wa ? (
          <a className="btn btn--secondary btn--small" href={wa} target="_blank" rel="noreferrer noopener">
            واتساب
          </a>
        ) : null}
      </div>
      {contactVisible.office_hours && row.office_hours?.trim() ? (
        <div className="official-contact__block">
          <h3 className="official-subsection__title">أوقات التواصل</h3>
          <p className="official-subsection__body">{row.office_hours.trim()}</p>
        </div>
      ) : null}
      {contactVisible.social && Object.keys(social).some((k) => social[k]?.trim()) ? (
        <div className="official-contact__block">
          <h3 className="official-subsection__title">الشبكات والروابط</h3>
          <ul className="official-list official-list--social">
            {Object.entries(social).map(([key, url]) => {
              const u = url?.trim()
              if (!u) return null
              const href = /^https?:\/\//i.test(u) ? u : `https://${u}`
              return (
                <li key={key}>
                  <a href={href} target="_blank" rel="noreferrer noopener" className="official-link">
                    {SOCIAL_LABELS[key] ?? key}
                  </a>
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}
    </section>
  )
}
