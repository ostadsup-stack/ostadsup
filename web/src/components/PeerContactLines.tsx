import { whatsappHref } from '../lib/whatsapp'

type Props = {
  phone?: string | null
  whatsapp?: string | null
  email?: string | null
  /** الرقم الجامعي (للطالب في عضوية الفوج) */
  studentNumber?: string | null
  /** إذا زُيغ عن true لا يُعرض سطر الرقم الجامعي */
  showStudentNumber?: boolean
}

export function PeerContactLines({
  phone,
  whatsapp,
  email,
  studentNumber,
  showStudentNumber = true,
}: Props) {
  const wa = whatsapp?.trim() ? whatsappHref(whatsapp.trim()) : null
  const tel = phone?.trim() || ''
  const em = email?.trim() || ''
  const sn = studentNumber?.trim() || ''
  const has =
    Boolean(tel) || Boolean(wa) || Boolean(em) || (showStudentNumber && Boolean(sn))

  if (!has) {
    return <p className="muted small">لا توجد بيانات تواصل ظاهرة (يملؤها صاحب الحساب في ملفه الشخصي).</p>
  }

  return (
    <ul className="peer-contact-lines">
      {tel ? (
        <li>
          <span className="peer-contact-lines__label">هاتف</span>{' '}
          <a href={`tel:${tel.replace(/\s/g, '')}`} dir="ltr" className="peer-contact-lines__value">
            {tel}
          </a>
        </li>
      ) : null}
      {wa ? (
        <li>
          <span className="peer-contact-lines__label">واتساب</span>{' '}
          <a href={wa} target="_blank" rel="noreferrer" dir="ltr" className="peer-contact-lines__value">
            واتساب
          </a>
        </li>
      ) : null}
      {em ? (
        <li>
          <span className="peer-contact-lines__label">البريد</span>{' '}
          <a href={`mailto:${em}`} dir="ltr" className="peer-contact-lines__value">
            {em}
          </a>
        </li>
      ) : null}
      {showStudentNumber && sn ? (
        <li>
          <span className="peer-contact-lines__label">الرقم الجامعي</span>{' '}
          <span dir="ltr" className="peer-contact-lines__value">
            {sn}
          </span>
        </li>
      ) : null}
    </ul>
  )
}
