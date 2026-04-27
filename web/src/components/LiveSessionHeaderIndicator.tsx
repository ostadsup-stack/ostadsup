import { Link } from 'react-router-dom'
import type { LiveSessionHeaderState } from '../hooks/useLiveSessionHeader'

type Props = {
  state: LiveSessionHeaderState
  onLiveSessionUpdated?: () => void
}

function statusStack(
  dotClass: string,
  modeLabel: string,
  indicatorLabel: string,
  sessionSummary: string | null,
) {
  const detail = [indicatorLabel, sessionSummary].filter(Boolean).join(' · ')
  return (
    <div className="live-session-header__stack">
      <div className="live-session-header__status-row">
        <span className={dotClass} aria-hidden />
        <span className="live-session-header__mode">{modeLabel}</span>
      </div>
      {detail ? (
        <div className="live-session-header__meta-line" title={detail}>
          {detail}
        </div>
      ) : null}
    </div>
  )
}

export function LiveSessionHeaderIndicator({ state, onLiveSessionUpdated }: Props) {
  if (!state) return null
  const { indicator, href, external, sessionMode, sessionSummary } = state
  const modeLabel = sessionMode === 'online' ? 'حصة عن بعد' : 'حصة حضورية'
  const dotClass =
    indicator.kind === 'green'
      ? 'live-session-dot live-session-dot--green'
      : indicator.kind === 'orange'
        ? 'live-session-dot live-session-dot--orange'
        : 'live-session-dot live-session-dot--red'

  const titleBase = `${modeLabel} — ${indicator.label}`
  const title = sessionSummary ? `${titleBase} — ${sessionSummary}` : titleBase

  const variantClass = `live-session-header-block--${indicator.kind}`
  if (indicator.kind === 'red') {
    return (
      <div className={`live-session-header-block ${variantClass}`} role="status" aria-label={title}>
        <div className="live-session-header__status-live">
          {statusStack(dotClass, modeLabel, indicator.label, sessionSummary)}
        </div>
      </div>
    )
  }

  const ctaLabel =
    indicator.kind === 'orange' ? 'عرض التفاصيل' : sessionMode === 'online' ? 'ادخل إلى البث' : 'عرض المكان'
  const ctaClass = 'btn btn--small btn--primary live-session-header__cta'

  return (
    <div className={`live-session-header-block ${variantClass}`} role="group" aria-label={title}>
      <div className="live-session-header__status-live">
        {statusStack(dotClass, modeLabel, indicator.label, sessionSummary)}
      </div>
      {external ? (
        <a
          href={href}
          className={ctaClass}
          title={title}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => onLiveSessionUpdated?.()}
        >
          {ctaLabel}
        </a>
      ) : (
        <Link to={href} className={ctaClass} title={title} onClick={() => onLiveSessionUpdated?.()}>
          {ctaLabel}
        </Link>
      )}
    </div>
  )
}
