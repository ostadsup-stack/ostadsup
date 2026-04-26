import { Link } from 'react-router-dom'
import type { LiveSessionHeaderState } from '../hooks/useLiveSessionHeader'

type Props = {
  state: LiveSessionHeaderState
}

export function LiveSessionHeaderIndicator({ state }: Props) {
  if (!state) return null
  const { indicator, livePath } = state
  const dotClass =
    indicator.kind === 'green'
      ? 'live-session-dot live-session-dot--green'
      : indicator.kind === 'orange'
        ? 'live-session-dot live-session-dot--orange'
        : 'live-session-dot live-session-dot--red'

  return (
    <Link
      to={livePath}
      className="live-session-header"
      title={`${indicator.label} — فتح صفحة الحصة عن بعد`}
    >
      <span className={dotClass} aria-hidden />
      <span className="live-session-header__label">{indicator.label}</span>
    </Link>
  )
}
