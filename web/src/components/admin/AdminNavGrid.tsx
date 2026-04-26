import { Link } from 'react-router-dom'
import { AdminCard } from './AdminCard'
import { IconBook, IconInbox, IconLayout, IconMail, IconPosts } from '../NavIcons'

export type AdminNavIconName = 'book' | 'mail' | 'posts' | 'inbox' | 'layout'

export type AdminNavItem = {
  to: string
  title: string
  description: string
  icon: AdminNavIconName
}

const NAV: AdminNavItem[] = [
  { to: '/admin/groups', title: 'الأفواج', description: 'إدارة وإنشاء الأفواج', icon: 'book' },
  { to: '/admin/invitations', title: 'الدعوات', description: 'إرسال دعوات وعرض السجل', icon: 'mail' },
  { to: '/admin/posts', title: 'المنشورات', description: 'إعلانات على مستوى المساحة', icon: 'posts' },
  { to: '/admin/messages', title: 'الرسائل', description: 'محادثة مع المستخدمين', icon: 'inbox' },
]

function IconByName({ name, className }: { name: AdminNavIconName; className?: string }) {
  switch (name) {
    case 'layout':
      return <IconLayout className={className} />
    case 'book':
      return <IconBook className={className} />
    case 'mail':
      return <IconMail className={className} />
    case 'posts':
      return <IconPosts className={className} />
    case 'inbox':
      return <IconInbox className={className} />
    default:
      return <IconLayout className={className} />
  }
}

type AdminNavGridProps = { showHomeTile?: boolean }

/**
 * بطاقات تنقل سريع إلى أقسام الإدارة.
 */
export function AdminNavGrid({ showHomeTile = false }: AdminNavGridProps) {
  return (
    <ul className="admin-nav-grid">
      {showHomeTile ? (
        <li>
          <Link to="/admin/dashboard" className="admin-nav-grid__link admin-nav-grid__link--current">
            <span className="admin-nav-grid__icon-wrap" aria-hidden>
              <IconLayout className="admin-nav-grid__icon" />
            </span>
            <span className="admin-nav-grid__text">
              <span className="admin-nav-grid__title">نظرة عامة</span>
              <span className="admin-nav-grid__desc">لوحة التحكم</span>
            </span>
          </Link>
        </li>
      ) : null}
      {NAV.map((n) => (
        <li key={n.to}>
          <Link to={n.to} className="admin-nav-grid__link">
            <span className="admin-nav-grid__icon-wrap" aria-hidden>
              <IconByName name={n.icon} className="admin-nav-grid__icon" />
            </span>
            <span className="admin-nav-grid__text">
              <span className="admin-nav-grid__title">{n.title}</span>
              <span className="admin-nav-grid__desc">{n.description}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

export function AdminNavSection() {
  return (
    <AdminCard as="section" aria-labelledby="admin-nav-heading">
      <h2 className="visually-hidden" id="admin-nav-heading">
        اختصارات الأقسام
      </h2>
      <AdminNavGrid />
    </AdminCard>
  )
}
