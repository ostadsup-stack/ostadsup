import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Loading } from '../Loading'
import { EmptyState } from '../EmptyState'
import { rgbaFromHex } from '../../lib/colorContrast'
import { formatAppTime } from '../../lib/appDateTime'
import {
  SCHEDULE_COL_HEIGHT,
  SCHEDULE_DAY_LABELS,
  SCHEDULE_HOUR_END,
  SCHEDULE_HOUR_START,
  SCHEDULE_SLOT_PX,
  addDays,
  assignScheduleLanes,
  formatDayDate,
  sameLocalDay,
  startOfMonday,
  type ScheduleWeekEventRow,
} from '../../lib/teacherWeekSchedule'

type Props = {
  rows: ScheduleWeekEventRow[]
  weekOffset: number
  onWeekOffsetChange: (next: number | ((prev: number) => number)) => void
  loading: boolean
  /** يُبنى رابط كل حصة (مثلاً مع ?event= للرئيسية) */
  buildEventLink: (ev: ScheduleWeekEventRow) => string
  emptyHint?: string
  /** إن وُجد يُعرض EmptyState بدل فقرة نصية */
  emptyStateTitle?: string
}

export function TeacherWeekScheduleGrid({
  rows,
  weekOffset,
  onWeekOffsetChange,
  loading,
  buildEventLink,
  emptyHint = 'أضف حصصاً من صفحة كل فوج، أو انتقل لأسبوع آخر.',
  emptyStateTitle,
}: Props) {
  const weekStart = useMemo(() => addDays(startOfMonday(new Date()), weekOffset * 7), [weekOffset])

  const weekEnd = useMemo(() => {
    const x = addDays(weekStart, 6)
    x.setHours(23, 59, 59, 999)
    return x
  }, [weekStart])

  const dayDates = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart])

  const byDay = useMemo(() => {
    return dayDates.map((dayDate) => {
      const list = rows.filter((r) => sameLocalDay(new Date(r.starts_at), dayDate))
      return assignScheduleLanes(list)
    })
  }, [rows, dayDates])

  const weekLabel = useMemo(() => {
    const a = formatDayDate(weekStart)
    const b = formatDayDate(weekEnd)
    return `${a} — ${b}`
  }, [weekStart, weekEnd])

  return (
    <>
      <div className="schedule-week__toolbar">
        <button type="button" className="btn btn--ghost" onClick={() => onWeekOffsetChange((o) => o - 1)}>
          الأسبوع السابق
        </button>
        <span className="schedule-week__range muted">{weekLabel}</span>
        <button type="button" className="btn btn--ghost" onClick={() => onWeekOffsetChange((o) => o + 1)}>
          الأسبوع التالي
        </button>
        {weekOffset !== 0 ? (
          <button type="button" className="btn btn--ghost" onClick={() => onWeekOffsetChange(0)}>
            هذا الأسبوع
          </button>
        ) : null}
      </div>

      {loading ? (
        <Loading label="جاري تحميل الجدول…" />
      ) : rows.length === 0 ? (
        emptyStateTitle ? (
          <EmptyState title={emptyStateTitle} hint={emptyHint} />
        ) : (
          <p className="muted small">{emptyHint}</p>
        )
      ) : null}

      {!loading && rows.length > 0 ? (
        <div className="schedule-week__scroll">
          <div className="schedule-week">
            <div className="schedule-week__head">
              <div className="schedule-week__corner" aria-hidden />
              {dayDates.map((d, i) => (
                <div key={d.toISOString()} className="schedule-week__day-head">
                  <span className="schedule-week__day-name">{SCHEDULE_DAY_LABELS[i]}</span>
                  <span className="schedule-week__day-date muted">{formatDayDate(d)}</span>
                </div>
              ))}
            </div>
            <div className="schedule-week__main">
              <div className="schedule-week__ticks" style={{ height: SCHEDULE_COL_HEIGHT }}>
                {Array.from({ length: SCHEDULE_HOUR_END - SCHEDULE_HOUR_START }, (_, h) => (
                  <div key={h} className="schedule-week__tick" style={{ height: SCHEDULE_SLOT_PX }}>
                    <span>{SCHEDULE_HOUR_START + h}:00</span>
                  </div>
                ))}
              </div>
              <div className="schedule-week__columns">
                {byDay.map((placed, di) => (
                  <div
                    key={dayDates[di].toISOString()}
                    className="schedule-week__column"
                    style={{ height: SCHEDULE_COL_HEIGHT }}
                  >
                    <div className="schedule-week__grid-lines" aria-hidden>
                      {Array.from({ length: SCHEDULE_HOUR_END - SCHEDULE_HOUR_START }, (_, h) => (
                        <div key={h} className="schedule-week__hline" style={{ top: h * SCHEDULE_SLOT_PX }} />
                      ))}
                    </div>
                    {placed.map((p) => {
                      const w = 100 / p.laneCount
                      const left = (p.lane / p.laneCount) * 100
                      const cancelled = p.ev.status === 'cancelled'
                      const rawAccent = p.ev.groups?.accent_color
                      const accentHex =
                        typeof rawAccent === 'string' && /^#[0-9A-Fa-f]{6}$/.test(rawAccent.trim())
                          ? rawAccent.trim()
                          : null
                      const tint = accentHex ? rgbaFromHex(accentHex, 0.22) : null
                      const borderTint = accentHex ? rgbaFromHex(accentHex, 0.5) : null
                      return (
                        <Link
                          key={p.ev.id}
                          to={buildEventLink(p.ev)}
                          className={`schedule-week__event${cancelled ? ' schedule-week__event--cancelled' : ''}`}
                          style={{
                            top: `${p.topPct}%`,
                            height: `${p.heightPct}%`,
                            left: `${left}%`,
                            width: `${w}%`,
                            ...(tint && borderTint
                              ? { background: tint, borderColor: borderTint }
                              : {}),
                          }}
                          title={p.ev.note ?? undefined}
                        >
                          <span className="schedule-week__event-time">
                            {formatAppTime(p.ev.starts_at, {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                          <span className="schedule-week__event-title">
                            {p.ev.subject_name?.trim() || 'حصة'}
                          </span>
                          <span className="schedule-week__event-meta muted">
                            {p.ev.profiles?.full_name?.trim() || 'أستاذ'} · {p.ev.groups?.group_name ?? 'فوج'} ·{' '}
                            {p.ev.mode === 'online' ? 'عن بُعد' : 'حضوري'}
                          </span>
                        </Link>
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
