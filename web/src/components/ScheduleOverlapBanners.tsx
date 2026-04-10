import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { CrossGroupOverlapPair, ScheduleWeekOverlapAudit } from '../lib/teacherWeekSchedule'

function shortId(id: string) {
  return id.length > 12 ? `${id.slice(0, 8)}…` : id
}

function displayGroupName(n: string | null | undefined) {
  const t = (n ?? '').trim()
  return t.length > 0 ? t : 'بدون اسم'
}

/** يُفترض أن «الفوج الجديد» هو فوج الحصة الأحدث إنشاءً بين المُتداخلتين */
function newOldFromCrossPair(cg: CrossGroupOverlapPair) {
  const tA = new Date(cg.createdAtA).getTime()
  const tB = new Date(cg.createdAtB).getTime()
  if (tB > tA) {
    return {
      newId: cg.gB,
      oldId: cg.gA,
      newName: displayGroupName(cg.nameB),
      oldName: displayGroupName(cg.nameA),
    }
  }
  if (tA > tB) {
    return {
      newId: cg.gA,
      oldId: cg.gB,
      newName: displayGroupName(cg.nameA),
      oldName: displayGroupName(cg.nameB),
    }
  }
  if (cg.gA < cg.gB) {
    return {
      newId: cg.gB,
      oldId: cg.gA,
      newName: displayGroupName(cg.nameB),
      oldName: displayGroupName(cg.nameA),
    }
  }
  return {
    newId: cg.gA,
    oldId: cg.gB,
    newName: displayGroupName(cg.nameA),
    oldName: displayGroupName(cg.nameB),
  }
}

type CrossChoice = null | 'keep-new' | 'leave-old'

/** شرائح توضيحية عند تداخل الحصص في جدول الأسبوع (دليل تشخيص + إرشاد إصلاح) */
export function ScheduleOverlapBanners({ audit }: { audit: ScheduleWeekOverlapAudit }) {
  const first = audit.sameGroupPairs[0]
  const crossKey =
    audit.crossGroupSameDayPairs.length > 0
      ? `${audit.crossGroupSameDayPairs[0].idA}:${audit.crossGroupSameDayPairs[0].idB}`
      : null

  const [crossChoice, setCrossChoice] = useState<CrossChoice>(null)

  useEffect(() => {
    setCrossChoice(null)
  }, [crossKey])

  if (audit.sameGroupTimeOverlap && first) {
    return (
      <div className="banner banner--error student-home__warn" role="alert">
        <strong>تعارض بيانات لنفس الفوج:</strong> فوج «{first.groupName ?? 'بدون اسم'}» يحتوي حصتين فعّالتين في وقت متداخل.
        <br />
        <span className="muted small">
          معرّف الحصتين: {shortId(first.idA)} و {shortId(first.idB)} — نفس الأستاذ:{' '}
          {first.sameTeacher ? 'نعم' : 'لا'}.
        </span>
        <br />
        <span className="small">
          لمنع التكرار مستقبلاً: نفِّذ على Supabase ملف{' '}
          <code className="input--ltr">supabase/apply_schedule_booking_bundle.sql</code> ثم احذف أو أعد جدولة
          إحدى الحصتين من صفحة الفوج أو من محرر SQL.
        </span>
      </div>
    )
  }

  if (audit.crossGroupSameDayPairs.length > 0) {
    const cg = audit.crossGroupSameDayPairs[0]
    const { newId, oldId, newName, oldName } = newOldFromCrossPair(cg)

    return (
      <div className="banner banner--info student-home__warn schedule-overlap-cross" role="status">
        <p>
          <strong>تداخل زمني بين فوجين مختلفين:</strong> المعرفان <code className="input--ltr">{shortId(cg.gA)}</code>{' '}
          و <code className="input--ltr">{shortId(cg.gB)}</code> مختلفان — القاعدة تسمح بذلك. إن بدا الاسم متشابهاً
          في الجدول فهما فوجان منفصلان.
        </p>
        <p className="muted small schedule-overlap-cross__hint">
          «الفوج الجديد» هنا هو فوج الحصة الأحدث إنشاءً بين المُتداخلتين؛ يمكنك تغيير قرارك لاحقاً بإعادة الجدولة أو
          الانسحاب من أحد الأفواج.
        </p>

        {crossChoice === null ? (
          <div className="schedule-overlap-cross__actions">
            <button type="button" className="btn btn--primary" onClick={() => setCrossChoice('keep-new')}>
              ثبت الفوج الجديد ({newName})
            </button>
            <button type="button" className="btn btn--secondary" onClick={() => setCrossChoice('leave-old')}>
              اترك الفوج القديم ({oldName})
            </button>
          </div>
        ) : null}

        {crossChoice === 'keep-new' ? (
          <div className="banner banner--warn schedule-overlap-cross__followup" role="region">
            <strong>تأكيد الإبقاء على «{newName}»</strong>
            <p className="small" style={{ marginTop: '0.5rem', marginBottom: 0 }}>
              يجب أن تعيد جدولة حصة فوج «{oldName}» إلى وقت آخر لا يتداخل مع حصصك، وإلا سيبقى التداخل ظاهراً في
              الجدول. افتح صفحة الفوج وعدّل الحصة من قسم الجدول.
            </p>
            <p className="schedule-overlap-cross__followup-links">
              <Link to={`/t/groups/${oldId}#group-schedule`} className="btn btn--secondary btn--small">
                فتح جدول «{oldName}» لإعادة الجدولة
              </Link>{' '}
              <Link to={`/t/groups/${newId}#group-schedule`} className="btn btn--ghost btn--small">
                صفحة «{newName}»
              </Link>
            </p>
          </div>
        ) : null}

        {crossChoice === 'leave-old' ? (
          <div className="banner banner--warn schedule-overlap-cross__followup" role="region">
            <strong>اخترت التخلي عن «{oldName}»</strong>
            <p className="small" style={{ marginTop: '0.5rem', marginBottom: 0 }}>
              إن كنت أستاذاً مرتبطاً بهذا الفوج (ولست مالكاً)، افتح صفحة الفوج واستخدم «الانسحاب من هذا الفوج». إن
              كنت مالكاً للفوج فيمكنك أرشفته من نفس الصفحة، أو الإبقاء عليه مع إعادة جدولة إحدى الحصص.
            </p>
            <p style={{ marginTop: '0.75rem', marginBottom: 0 }}>
              <Link to={`/t/groups/${oldId}`} className="btn btn--secondary btn--small">
                فتح صفحة فوج «{oldName}»
              </Link>
            </p>
          </div>
        ) : null}
      </div>
    )
  }

  return null
}
