import { Link } from 'react-router-dom'
import type { AdminActivityItem, AdminActivityType } from '../../lib/adminRecentActivity'
import { activityTypeLabel } from '../../lib/adminRecentActivity'
import { formatAppDateTime } from '../../lib/appDateTime'
import { AdminCard, AdminCardHeader } from './AdminCard'

type AdminActivityFeedProps = {
  items: AdminActivityItem[]
  loading: boolean
}

function feedIconClass(t: AdminActivityType): string {
  if (t === 'cohort_created') return 'admin-activity__badge--cohort'
  if (t === 'invitation_sent') return 'admin-activity__badge--invite'
  return 'admin-activity__badge--post'
}

/**
 * عرض زمني لآخر العمليات: أفواج، دعوات، إعلانات.
 */
export function AdminActivityFeed({ items, loading }: AdminActivityFeedProps) {
  if (loading) {
    return (
      <AdminCard as="section" aria-labelledby="admin-activity-heading">
        <AdminCardHeader
          id="admin-activity-heading"
          title="النشاطات الأخيرة"
          description="آخر العمليات في النظام"
        />
        <p className="admin-activity__loading muted" aria-busy>
          جاري التحميل…
        </p>
      </AdminCard>
    )
  }

  if (items.length === 0) {
    return (
      <AdminCard as="section" aria-labelledby="admin-activity-heading">
        <AdminCardHeader
          id="admin-activity-heading"
          title="النشاطات الأخيرة"
          description="آخر العمليات في النظام"
        />
        <p className="muted">لا يوجد نشاط مسجّل بعد — أنشئ فوجاً، أرسل دعوة، أو انشر إعلاناً.</p>
      </AdminCard>
    )
  }

  return (
    <AdminCard as="section" aria-labelledby="admin-activity-heading">
      <AdminCardHeader
        id="admin-activity-heading"
        title="النشاطات الأخيرة"
        description="آخر العمليات: إنشاء فوج، إرسال دعوة، نشر إعلان"
      />
      <ol className="admin-activity__list">
        {items.map((it) => (
          <li key={it.key}>
            <Link to={it.href} className="admin-activity__row">
              <span className={`admin-activity__badge ${feedIconClass(it.type)}`} title={it.title}>
                {activityTypeLabel(it.type)}
              </span>
              <span className="admin-activity__content">
                <span className="admin-activity__line">{it.title}</span>
                <span className="admin-activity__detail muted">{it.detail}</span>
              </span>
              <time className="admin-activity__time" dateTime={it.at}>
                {formatAppDateTime(it.at, { dateStyle: 'short', timeStyle: 'short' })}
              </time>
            </Link>
          </li>
        ))}
      </ol>
    </AdminCard>
  )
}
