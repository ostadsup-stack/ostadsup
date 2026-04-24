import type { PublicTeacherPageRow } from '../../../types'

type Props = { row: PublicTeacherPageRow }

export function OfficialFooter({ row }: Props) {
  return (
    <footer className="official-footer">
      <p className="official-footer__line">
        {row.full_name}
        {row.workspace_display_name ? ` — ${row.workspace_display_name}` : ''}
      </p>
      <p className="muted small official-footer__rights">صفحة عامة على منصة Ostadi — المحتوى من مسؤولية الأستاذ.</p>
    </footer>
  )
}
