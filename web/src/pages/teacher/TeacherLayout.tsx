import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import {
  IconBell,
  IconCalendar,
  IconGlobe,
  IconInbox,
  IconLayout,
  IconLogOut,
} from '../../components/NavIcons'
import { fetchWorkspaceForTeacher } from '../../lib/workspace'
import { ThemeToggle } from '../../components/ThemeToggle'

const TEACHER_MENU_ID = 'teacher-shell-nav-menu'

const TEACHER_MENU_LINKS = [
  { to: '/t/account', label: 'حسابي' },
  { to: '/t/schedule', label: 'الحصص' },
  { to: '/t/groups', label: 'الأفواج' },
  { to: '/t/inbox', label: 'الرسائل' },
  { to: '/t/books', label: 'مكتبتي' },
  { to: '/t/books#library-add', label: 'إضافة محتوى' },
  { to: '/t/posts', label: 'منشوراتي' },
  { to: '/t/seminars', label: 'ندواتي' },
  { to: '/t/achievements', label: 'إنجازاتي' },
  { to: '/t/settings', label: 'إعدادات' },
] as const

export function TeacherLayout() {
  const { profile, signOut, session } = useAuth()
  const [unreadNotif, setUnreadNotif] = useState<number | null>(null)
  const [workspacePublicSlug, setWorkspacePublicSlug] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuWrapRef = useRef<HTMLDivElement>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const firstMenuItemRef = useRef<HTMLAnchorElement>(null)

  useEffect(() => {
    let ok = true
    const uid = session?.user?.id
    if (!uid) {
      setUnreadNotif(null)
      return
    }
    ;(async () => {
      const { count, error } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', uid)
        .eq('is_read', false)
      if (!ok) return
      if (error) setUnreadNotif(null)
      else setUnreadNotif(count ?? 0)
    })()
    return () => {
      ok = false
    }
  }, [session?.user?.id])

  useEffect(() => {
    let ok = true
    const uid = session?.user?.id
    if (!uid) {
      setWorkspacePublicSlug(null)
      return
    }
    ;(async () => {
      const { workspace, error } = await fetchWorkspaceForTeacher(uid)
      if (!ok) return
      if (error || !workspace?.slug) {
        setWorkspacePublicSlug(null)
        return
      }
      setWorkspacePublicSlug(String(workspace.slug))
    })()
    return () => {
      ok = false
    }
  }, [session?.user?.id])

  useEffect(() => {
    if (!menuOpen) return
    const t = window.setTimeout(() => firstMenuItemRef.current?.focus(), 0)
    return () => window.clearTimeout(t)
  }, [menuOpen])

  useEffect(() => {
    if (!menuOpen) return
    function onPointerDown(e: PointerEvent) {
      const el = menuWrapRef.current
      if (el && !el.contains(e.target as Node)) setMenuOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setMenuOpen(false)
        menuButtonRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  const name = profile?.full_name?.trim() || 'أستاذ'
  const initial = name.charAt(0) || '?'

  const bottomNavClass = ({ isActive }: { isActive: boolean }) =>
    `teacher-bottom-nav__link${isActive ? ' is-active' : ''}`

  return (
    <div className="layout layout--teacher">
      <header className="header header--teacher-shell">
        <div className="teacher-shell__top">
          <div className="teacher-shell__brand-block">
            <Link to="/t" className="teacher-shell__brand-link">
              Ostadi
            </Link>
            <div className="teacher-shell__identity" ref={menuWrapRef}>
              <Link
                to="/t"
                className="teacher-shell__avatar-link"
                aria-label={`مساحتي — ${name}`}
                title="الرئيسية"
              >
                <div className="teacher-shell__avatar-wrap">
                  {profile?.avatar_url ? (
                    <img src={profile.avatar_url} alt="" className="teacher-shell__avatar" />
                  ) : (
                    <span className="teacher-shell__avatar teacher-shell__avatar--placeholder" aria-hidden>
                      {initial}
                    </span>
                  )}
                </div>
              </Link>
              <span className="teacher-shell__identity-name" title={name}>
                {name}
              </span>
              <button
                ref={menuButtonRef}
                type="button"
                className="teacher-shell__menu-trigger"
                aria-expanded={menuOpen}
                aria-controls={TEACHER_MENU_ID}
                aria-haspopup="true"
                onClick={() => setMenuOpen((o) => !o)}
              >
                <span className="teacher-shell__menu-trigger-chevron" aria-hidden>
                  ▼
                </span>
                <span className="visually-hidden">قائمة التنقل</span>
              </button>
              {menuOpen ? (
                <div
                  id={TEACHER_MENU_ID}
                  className="teacher-shell__menu"
                  role="menu"
                  aria-label="روابط سريعة"
                >
                  {TEACHER_MENU_LINKS.map((item, i) => (
                    <Link
                      key={item.to}
                      ref={i === 0 ? firstMenuItemRef : undefined}
                      role="menuitem"
                      to={item.to}
                      className="teacher-shell__menu-link"
                      onClick={() => setMenuOpen(false)}
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <div className="teacher-shell__actions">
            <Link
              to="/t/notifications"
              className="btn btn--icon btn--ghost teacher-shell__notif-link"
              aria-label="الإشعارات"
            >
              <IconBell />
              {unreadNotif !== null && unreadNotif > 0 ? (
                <span className="teacher-shell__notif-badge">{unreadNotif > 99 ? '99+' : unreadNotif}</span>
              ) : null}
            </Link>
            <ThemeToggle />
            <button
              type="button"
              className="btn btn--icon btn--ghost"
              onClick={() => void signOut()}
              aria-label="تسجيل الخروج"
            >
              <IconLogOut />
            </button>
          </div>
        </div>
      </header>
      <main className="main main--app main--teacher-wide main--teacher-pad">
        <Outlet />
      </main>
      <nav className="teacher-bottom-nav" aria-label="تنقل الأستاذ">
        <NavLink to="/t" end className={bottomNavClass}>
          <IconLayout className="teacher-bottom-nav__icon" />
          <span>الرئيسية</span>
        </NavLink>
        <NavLink to="/t/groups" className={bottomNavClass}>
          <span className="teacher-bottom-nav__icon teacher-bottom-nav__icon--glyph" aria-hidden>
            ◈
          </span>
          <span>الأفواج</span>
        </NavLink>
        <NavLink to="/t/inbox" className={bottomNavClass}>
          <IconInbox className="teacher-bottom-nav__icon" />
          <span>الرسائل</span>
        </NavLink>
        <NavLink to="/t/schedule" className={bottomNavClass}>
          <IconCalendar className="teacher-bottom-nav__icon" />
          <span>الجدول</span>
        </NavLink>
        <NavLink
          to={
            workspacePublicSlug
              ? `/p/${encodeURIComponent(workspacePublicSlug)}`
              : '/t/account'
          }
          className={bottomNavClass}
          title={workspacePublicSlug ? undefined : 'أكمل بيانات مساحتك ليظهر الرابط العام'}
        >
          <IconGlobe className="teacher-bottom-nav__icon" />
          <span>الصفحة الرسمية</span>
        </NavLink>
      </nav>
    </div>
  )
}
