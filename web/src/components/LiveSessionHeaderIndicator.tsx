import { Link } from 'react-router-dom'
import type { LiveSessionHeaderState } from '../hooks/useLiveSessionHeader'

type Props = {
  state: LiveSessionHeaderState
}

export function LiveSessionHeaderIndicator({ state }: Props) {
  if (!state) return null
  const { indicator, href, external } = state
  const dotClass =
    indicator.kind === 'green'
      ? 'live-session-dot live-session-dot--green'
      : indicator.kind === 'orange'
        ? 'live-session-dot live-session-dot--orange'
        : 'live-session-dot live-session-dot--red'

  const title =
    indicator.kind === 'red'
      ? `${indicator.label} — صفحة الحصة عن بعد`
      : external
        ? `${indicator.label} — فتح الاجتماع`
        : `${indicator.label} — صفحة الحصة عن بعد`

  const statusRow = (
    <div className="live-session-header__status-row">
      <span className={dotClass} aria-hidden />
      <span className="live-session-header__label">{indicator.label}</span>
    </div>
  )

  const showEnterBroadcast =
    indicator.kind === 'green' || indicator.kind === 'orange'

  if (showEnterBroadcast) {
    const ctaClass = 'btn btn--small btn--primary live-session-header__cta'
    return (
      <div className="live-session-header-block" role="group" aria-label={indicator.label}>
        <div className="live-session-header__status-live">{statusRow}</div>
        {external ? (
          <a
            href={href}
            className={ctaClass}
            title={title}
            target="_blank"
            rel="noopener noreferrer"
          >
            ادخل للبث
          </a>
        ) : (
          <Link to={href} className={ctaClass} title={title}>
            ادخل للبث
          </Link>
        )}
      </div>
    )
  }

  const inner = (
    <>
      <span className={dotClass} aria-hidden />
      <span className="live-session-header__label">{indicator.label}</span>
    </>
  )

  if (external) {
    return (
      <a
        href={href}
        className="live-session-header"
        title={title}
        target="_blank"
        rel="noopener noreferrer"
      >
        {inner}
      </a>
    )
  }

  return (
    <Link to={href} className="live-session-header" title={title}>
      {inner}
    </Link>
  )
}
