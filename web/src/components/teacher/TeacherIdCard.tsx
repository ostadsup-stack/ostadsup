import { useEffect, useMemo, useState } from 'react'
import { buildTeacherQrPayload } from '../../lib/ostadiQrPayload'

export type TeacherIdCardProps = {
  userId: string
  fullName: string
  specialty: string | null
  institutionalEmail: string | null
  avatarUrl: string | null
  nameInitial: string
}

export function TeacherIdCard({
  userId,
  fullName,
  specialty,
  institutionalEmail,
  avatarUrl,
  nameInitial,
}: TeacherIdCardProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const payload = useMemo(() => buildTeacherQrPayload(userId), [userId])

  useEffect(() => {
    let cancelled = false
    void import('qrcode').then((QR) => {
      QR.toDataURL(payload, {
        margin: 1,
        width: 124,
        color: { dark: '#4a1530', light: '#ffffff' },
        errorCorrectionLevel: 'M',
      })
        .then((url) => {
          if (!cancelled) setQrDataUrl(url)
        })
        .catch(() => {
          if (!cancelled) setQrDataUrl(null)
        })
    })
    return () => {
      cancelled = true
    }
  }, [payload])

  const displayName = fullName.trim() || '—'
  const emailLine = institutionalEmail?.trim() || '—'
  const specialtyLine = specialty?.trim() || null

  const copyPayload = () => {
    void navigator.clipboard.writeText(payload).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <article className="student-id-card teacher-id-card--faculty" aria-label="بطاقة هوية الأستاذ">
      <header className="student-id-card__masthead">
        <div className="student-id-card__brand">
          <span className="student-id-card__brand-mark">Ostadi</span>
          <span className="student-id-card__brand-sub" lang="en">
            Faculty ID
          </span>
        </div>
        <span className="student-id-card__masthead-badge" lang="en">
          VALID · DIGITAL
        </span>
      </header>

      <div className="student-id-card__body">
        <div className="student-id-card__photo-slot">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="student-id-card__photo" />
          ) : (
            <span className="student-id-card__photo student-id-card__photo--placeholder" aria-hidden>
              {nameInitial}
            </span>
          )}
        </div>

        <div className="student-id-card__fields">
          <div className="student-id-card__name-row">
            <h2 className="student-id-card__name">{displayName}</h2>
            <span className="student-id-card__pill teacher-id-card__pill">أستاذ</span>
          </div>
          <dl className="student-id-card__dl">
            <div className="student-id-card__dl-row">
              <dt>البريد المؤسسي</dt>
              <dd className="mono input--ltr" dir="ltr">
                {emailLine}
              </dd>
            </div>
            {specialtyLine ? (
              <div className="student-id-card__dl-row">
                <dt>التخصص · المنصب</dt>
                <dd>{specialtyLine}</dd>
              </div>
            ) : null}
          </dl>
        </div>

        <div className="student-id-card__qr-block">
          <div className="student-id-card__qr-frame">
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt="رمز QR للأستاذ — يحتوي على معرف فريد للتحقق"
                className="student-id-card__qr-img"
              />
            ) : (
              <div className="student-id-card__qr-placeholder" aria-hidden />
            )}
          </div>
          <p className="student-id-card__qr-hint" lang="en">
            Scan to verify
          </p>
          <button type="button" className="student-id-card__copy" onClick={copyPayload}>
            {copied ? 'تم النسخ' : 'نسخ بيانات الرمز'}
          </button>
        </div>
      </div>
    </article>
  )
}
