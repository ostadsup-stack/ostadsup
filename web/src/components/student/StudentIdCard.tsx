import { useEffect, useMemo, useState } from 'react'
import { formatStudyLevel } from '../../lib/studentGroup'
import { buildStudentQrPayload } from '../../lib/ostadiQrPayload'

export type StudentIdCardGroupSummary = {
  group_name: string | null
  academic_year: string | null
  faculty: string | null
  subject_name: string | null
  study_level: string | null
}

export type StudentIdCardProps = {
  userId: string
  fullName: string
  studentNumber: string | null
  avatarUrl: string | null
  nameInitial: string
  groupSummary: StudentIdCardGroupSummary | null
  isCoordinator?: boolean
}

export function StudentIdCard({
  userId,
  fullName,
  studentNumber,
  avatarUrl,
  nameInitial,
  groupSummary,
  isCoordinator,
}: StudentIdCardProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const payload = useMemo(() => buildStudentQrPayload(userId, studentNumber), [userId, studentNumber])

  useEffect(() => {
    let cancelled = false
    void import('qrcode').then((QR) => {
      QR.toDataURL(payload, {
        margin: 1,
        width: 124,
        color: { dark: '#0c2d5e', light: '#ffffff' },
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
  const idLine = studentNumber?.trim() || '—'
  const programLine =
    [groupSummary?.subject_name?.trim(), groupSummary?.faculty?.trim()].filter(Boolean).join(' · ') || null
  const yearLevel =
    [groupSummary?.academic_year?.trim(), formatStudyLevel(groupSummary?.study_level)]
      .filter((s) => s && s !== '—')
      .join(' · ') || null

  const copyPayload = () => {
    void navigator.clipboard.writeText(payload).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <article className="student-id-card" aria-label="بطاقة هوية الطالب">
      <header className="student-id-card__masthead">
        <div className="student-id-card__brand">
          <span className="student-id-card__brand-mark">Ostadi</span>
          <span className="student-id-card__brand-sub" lang="en">
            Student ID
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
            {isCoordinator ? <span className="student-id-card__pill">منسق</span> : null}
          </div>
          <dl className="student-id-card__dl">
            <div className="student-id-card__dl-row">
              <dt>الرقم الجامعي</dt>
              <dd className="mono input--ltr" dir="ltr">
                {idLine}
              </dd>
            </div>
            {programLine ? (
              <div className="student-id-card__dl-row">
                <dt>المسار الأكاديمي</dt>
                <dd>{programLine}</dd>
              </div>
            ) : null}
            {groupSummary?.group_name?.trim() ? (
              <div className="student-id-card__dl-row">
                <dt>الفوج</dt>
                <dd>{groupSummary.group_name.trim()}</dd>
              </div>
            ) : null}
            {yearLevel ? (
              <div className="student-id-card__dl-row">
                <dt>السنة · المستوى</dt>
                <dd>{yearLevel}</dd>
              </div>
            ) : null}
          </dl>
        </div>

        <div className="student-id-card__qr-block">
          <div className="student-id-card__qr-frame">
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt="رمز QR للطالب — يحتوي على معرف فريد للتحقق"
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
