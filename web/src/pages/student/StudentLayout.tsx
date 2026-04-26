import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import {
  IconBell,
  IconBook,
  IconCalendar,
  IconHome,
  IconInbox,
  IconLayout,
  IconLogOut,
} from '../../components/NavIcons'
import { ThemeToggle } from '../../components/ThemeToggle'
import { useLiveSessionHeader } from '../../hooks/useLiveSessionHeader'
import { LiveSessionHeaderIndicator } from '../../components/LiveSessionHeaderIndicator'
import { fetchActiveStudentMemberships, filterStudentRoleRows, formatStudyLevel } from '../../lib/studentGroup'

const STUDENT_MENU_ID = 'student-shell-profile-menu'

export function StudentLayout() {
  const { profile, signOut, session } = useAuth()
  const [unreadNotif, setUnreadNotif] = useState<number | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [studentMeta, setStudentMeta] = useState<{
    studentNumber: string | null
    primaryGroupId: string | null
    showCoordBadge: boolean
    groupSummary: {
      group_name: string | null
      academic_year: string | null
      faculty: string | null
      subject_name: string | null
      study_level: string | null
    } | null
  }>({
    studentNumber: null,
    primaryGroupId: null,
    showCoordBadge: false,
    groupSummary: null,
  })
  const menuWrapRef = useRef<HTMLDivElement>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const firstMenuLinkRef = useRef<HTMLAnchorElement>(null)

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
      setStudentMeta({
        studentNumber: null,
        primaryGroupId: null,
        showCoordBadge: false,
        groupSummary: null,
      })
      return
    }
    ;(async () => {
      const { rows } = await fetchActiveStudentMemberships(supabase, uid)
      if (!ok) return
      const students = filterStudentRoleRows(rows)
      const coords = rows.filter((r) => r.role_in_group === 'coordinator')
      const primaryRow = students[0] ?? coords[0] ?? rows[0]
      const primaryGroupId = primaryRow?.group_id ?? null
      const g = primaryRow?.groups
      setStudentMeta({
        studentNumber: students[0]?.student_number ?? null,
        primaryGroupId,
        showCoordBadge: coords.length > 0,
        groupSummary:
          g != null
            ? {
                group_name: g.group_name ?? null,
                academic_year: g.academic_year ?? null,
                faculty: g.faculty ?? null,
                subject_name: g.subject_name ?? null,
                study_level: g.study_level ?? null,
              }
            : null,
      })
    })()
    return () => {
      ok = false
    }
  }, [session?.user?.id])

  useEffect(() => {
    if (!menuOpen) return
    const t = window.setTimeout(() => firstMenuLinkRef.current?.focus(), 0)
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

  const liveHeader = useLiveSessionHeader(profile?.role, session?.user?.id)

  const name = profile?.full_name?.trim() || 'طالب'
  const initial = name.charAt(0) || '?'
  const email = session?.user?.email ?? ''

  const bottomNavClass = ({ isActive }: { isActive: boolean }) =>
    `teacher-bottom-nav__link${isActive ? ' is-active' : ''}`

  return (
    <div className="layout layout--student">
      <header className="header header--teacher-shell">
        <div className="teacher-shell__top">
          <div className="teacher-shell__brand-block">
            <Link to="/s" className="teacher-shell__brand-link">
              Ostadi
            </Link>
            <span className="header__badge header__badge--student student-shell__role-badge">طالب</span>
            {studentMeta.showCoordBadge ? (
              <span className="header__badge header__badge--coord student-shell__role-badge">منسق</span>
            ) : null}
            <div className="teacher-shell__identity" ref={menuWrapRef}>
              <Link
                to="/s"
                className="teacher-shell__avatar-link"
                aria-label={`الرئيسية — ${name}`}
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
                aria-controls={STUDENT_MENU_ID}
                aria-haspopup="true"
                onClick={() => setMenuOpen((o) => !o)}
              >
                <span className="teacher-shell__menu-trigger-chevron" aria-hidden>
                  ▼
                </span>
                <span className="visually-hidden">بيانات الطالب</span>
              </button>
              {menuOpen ? (
                <div
                  id={STUDENT_MENU_ID}
                  className="teacher-shell__menu teacher-shell__menu--student"
                  role="region"
                  aria-label="حسابي وإعدادات الطالب"
                >
                  <p className="teacher-shell__menu-heading">حسابي</p>
                  <div className="student-shell__data">
                    <div className="student-shell__data-row">
                      <span className="student-shell__data-label">الاسم الكامل</span>
                      <p className="student-shell__data-value">{profile?.full_name?.trim() || '—'}</p>
                    </div>
                    <div className="student-shell__data-row">
                      <span className="student-shell__data-label">الرقم الجامعي</span>
                      <p className="student-shell__data-value mono input--ltr" dir="ltr">
                        {studentMeta.studentNumber?.trim() || '—'}
                      </p>
                    </div>
                    <div className="student-shell__data-row">
                      <span className="student-shell__data-label">البريد</span>
                      <p className="student-shell__data-value mono input--ltr" dir="ltr">
                        {email || '—'}
                      </p>
                    </div>
                    <div className="student-shell__data-row">
                      <span className="student-shell__data-label">الهاتف</span>
                      <p className="student-shell__data-value mono input--ltr" dir="ltr">
                        {profile?.phone?.trim() || '—'}
                      </p>
                    </div>
                    <div className="student-shell__data-row">
                      <span className="student-shell__data-label">واتساب</span>
                      <p className="student-shell__data-value mono input--ltr" dir="ltr">
                        {profile?.whatsapp?.trim() || '—'}
                      </p>
                    </div>
                  </div>

                  {studentMeta.groupSummary ? (
                    <>
                      <p className="teacher-shell__menu-heading student-shell__menu-subheading">من الفوج</p>
                      <div className="student-shell__data">
                        <div className="student-shell__data-row">
                          <span className="student-shell__data-label">اسم الفوج</span>
                          <p className="student-shell__data-value">
                            {studentMeta.groupSummary.group_name?.trim() || '—'}
                          </p>
                        </div>
                        <div className="student-shell__data-row">
                          <span className="student-shell__data-label">السنة الدراسية</span>
                          <p className="student-shell__data-value">
                            {studentMeta.groupSummary.academic_year?.trim() || '—'}
                          </p>
                        </div>
                        <div className="student-shell__data-row">
                          <span className="student-shell__data-label">المستوى الدراسي</span>
                          <p className="student-shell__data-value">
                            {formatStudyLevel(studentMeta.groupSummary.study_level)}
                          </p>
                        </div>
                        <div className="student-shell__data-row">
                          <span className="student-shell__data-label">المادة / المقرر</span>
                          <p className="student-shell__data-value">
                            {studentMeta.groupSummary.subject_name?.trim() || '—'}
                          </p>
                        </div>
                        <div className="student-shell__data-row">
                          <span className="student-shell__data-label">الكلية / الشعبة</span>
                          <p className="student-shell__data-value">
                            {studentMeta.groupSummary.faculty?.trim() || '—'}
                          </p>
                        </div>
                      </div>
                    </>
                  ) : null}

                  <div className="student-shell__menu-divider" />
                  <p className="teacher-shell__menu-heading student-shell__menu-subheading">إعدادات</p>
                  <div className="student-shell__settings-row">
                    <span className="student-shell__data-label">المظهر</span>
                    <ThemeToggle />
                  </div>
                  <Link
                    ref={firstMenuLinkRef}
                    to="/s/account"
                    className="teacher-shell__menu-link"
                    onClick={() => setMenuOpen(false)}
                  >
                    تعديل بياناتي
                  </Link>
                  <Link
                    to="/s/join"
                    className="teacher-shell__menu-link"
                    onClick={() => setMenuOpen(false)}
                  >
                    الانضمام لفوج
                  </Link>
                  {studentMeta.primaryGroupId ? (
                    <>
                      <Link
                        to={`/s/groups/${studentMeta.primaryGroupId}`}
                        className="teacher-shell__menu-link"
                        onClick={() => setMenuOpen(false)}
                      >
                        صفحة فوجي
                      </Link>
                      <Link
                        to={`/s/groups/${studentMeta.primaryGroupId}#leave-group`}
                        className="teacher-shell__menu-link teacher-shell__menu-link--danger"
                        onClick={() => setMenuOpen(false)}
                      >
                        مغادرة الفوج
                      </Link>
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          <div className="teacher-shell__actions">
            <LiveSessionHeaderIndicator state={liveHeader} />
            <Link
              to="/s/notifications"
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

      <main className="main main--app main--teacher-wide main--student-pad">
        <Outlet />
      </main>

      <nav className="teacher-bottom-nav" aria-label="تنقل الطالب">
        <NavLink to="/s" end className={bottomNavClass}>
          <IconHome className="teacher-bottom-nav__icon" />
          <span>الرئيسية</span>
        </NavLink>
        <NavLink to="/s/messages" className={bottomNavClass}>
          <IconInbox className="teacher-bottom-nav__icon" />
          <span>الرسائل</span>
        </NavLink>
        <NavLink to="/s/posts" className={bottomNavClass}>
          <IconLayout className="teacher-bottom-nav__icon" />
          <span>المنشورات</span>
        </NavLink>
        <NavLink to="/s/schedule" className={bottomNavClass}>
          <IconCalendar className="teacher-bottom-nav__icon" />
          <span>جدول الحصص</span>
        </NavLink>
        <NavLink to="/s/materials" className={bottomNavClass}>
          <IconBook className="teacher-bottom-nav__icon" />
          <span>المواد</span>
        </NavLink>
      </nav>
    </div>
  )
}
