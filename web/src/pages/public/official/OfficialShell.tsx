import { Link } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { ThemeToggle } from '../../../components/ThemeToggle'

type ProfileLike = { role: string } | null | undefined

function accountHomeHref(profile: ProfileLike): string {
  if (!profile) return '/'
  if (profile.role === 'admin') return '/admin/dashboard'
  if (profile.role === 'teacher') return '/t'
  return '/s'
}

type Props = {
  children: React.ReactNode
  session: Session | null
  isOwnerTeacher: boolean
  /** لحساب رابط «حسابي» للزائر المسجّل */
  profile?: ProfileLike
  /** نص قصير في الشريط العلوي (يُعرض لصاحب الصفحة فقط) */
  brandShortLabel?: string
  /** وجهة النقر على العنوان (افتراضي الصفحة الرئيسية للتطبيق) */
  brandHref?: string
}

export function OfficialShell({
  children,
  session,
  isOwnerTeacher,
  profile,
  brandShortLabel = 'الصفحة الرسمية',
  brandHref = '/',
}: Props) {
  const visitorAccountHref = accountHomeHref(profile)

  return (
    <div className="layout layout--public official-public">
      <header className="official-public__topbar">
        {isOwnerTeacher ? (
          <Link to={brandHref} className="official-public__brand">
            <span className="official-public__brand-text">{brandShortLabel}</span>
          </Link>
        ) : (
          <span className="official-public__topbar-spacer" aria-hidden="true" />
        )}
        <nav className="official-public__nav-actions">
          {isOwnerTeacher ? (
            <>
              <Link to="/t/public-site" className="btn btn--ghost btn--small">
                تعديل الصفحة الرسمية
              </Link>
              <Link to="/t" className="btn btn--secondary btn--small">
                لوحة التحكم
              </Link>
              <ThemeToggle />
            </>
          ) : (
            <>
              <ThemeToggle />
              {session ? (
                <Link to={visitorAccountHref} className="btn btn--ghost btn--small">
                  حسابي
                </Link>
              ) : null}
            </>
          )}
        </nav>
      </header>
      <main className="official-public__main">
        <div className="official-public__page-shell">{children}</div>
      </main>
    </div>
  )
}
