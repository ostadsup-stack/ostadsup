import type { PublicScheduleTeaserRow } from '../../../types'

type Props = { rows: PublicScheduleTeaserRow[] }

export function OfficialSchedule({ rows }: Props) {
  if (rows.length === 0) return null
  return (
    <section className="official-card official-section" aria-labelledby="official-sched-h">
      <h2 id="official-sched-h" className="official-section__title">
        معاينة الحصص والأنشطة
      </h2>
      <p className="muted small official-section__lead">عرض مختصر — التفاصيل الكاملة داخل المنصة للمسجلين.</p>
      <ul className="official-sched-list">
        {rows.map((r) => (
          <li key={r.id} className="official-sched-item">
            <div className="official-sched-item__when">
              {new Date(r.starts_at).toLocaleString('ar-MA', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </div>
            <div className="official-sched-item__body">
              <span className="official-badge">{r.event_type === 'seminar' ? 'ندوة' : 'حصة'}</span>
              <span className="official-badge official-badge--muted">{r.mode === 'online' ? 'عن بعد' : 'حضوري'}</span>
              <p className="official-sched-item__subject">{r.subject_name?.trim() || '—'}</p>
              <p className="muted small">{r.group_label}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
