import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { ThemeToggle } from '../../components/ThemeToggle'
import { ErrorBanner } from '../../components/ErrorBanner'

export function TeacherSettingsPage() {
  const { signOut, profile } = useAuth()
  const [adminGroupId, setAdminGroupId] = useState('')
  const [adminBusy, setAdminBusy] = useState(false)
  const [adminErr, setAdminErr] = useState<string | null>(null)
  const [adminOk, setAdminOk] = useState<string | null>(null)

  async function adminSuspendGroup() {
    if (!adminGroupId.trim()) return
    setAdminBusy(true)
    setAdminErr(null)
    setAdminOk(null)
    const { error } = await supabase.rpc('admin_suspend_group', { p_group_id: adminGroupId.trim() })
    setAdminBusy(false)
    if (error) setAdminErr(error.message)
    else {
      setAdminOk('تم أرشفة الفوج.')
      setAdminGroupId('')
    }
  }

  return (
    <div className="page">
      <h1 className="page-header__title">إعدادات</h1>
      <p className="muted teacher-settings__intro">
        تفضيلات الواجهة والوصول السريع. بياناتك الشخصية تُحدَّث من «حسابي».
      </p>
      <section className="teacher-settings__section teacher-account__card">
        <h2 className="teacher-settings__h2">المظهر</h2>
        <p className="muted small">يمكنك أيضاً تبديل السمة من شريط الأعلى.</p>
        <div className="teacher-settings__theme-row">
          <span>الوضع الفاتح / الداكن</span>
          <ThemeToggle />
        </div>
      </section>
      {profile?.role === 'admin' ? (
        <section className="teacher-settings__section teacher-account__card">
          <h2 className="teacher-settings__h2">إشراف المدير</h2>
          <ErrorBanner message={adminErr} />
          {adminOk ? <p className="muted small">{adminOk}</p> : null}
          <p className="muted small">أرشفة فوج (معرّف UUID) عند التلاعب أو النزاع.</p>
          <label>
            معرّف الفوج
            <input
              value={adminGroupId}
              onChange={(e) => setAdminGroupId(e.target.value)}
              dir="ltr"
              className="input--ltr"
            />
          </label>
          <button
            type="button"
            className="btn btn--secondary"
            disabled={adminBusy}
            onClick={() => void adminSuspendGroup()}
          >
            {adminBusy ? 'جاري التنفيذ…' : 'أرشفة الفوج'}
          </button>
        </section>
      ) : null}

      <ul className="list-links teacher-settings__links">
        <li>
          <Link to="/t/account">حسابي — الاسم والصورة والتواصل</Link>
        </li>
        <li>
          <button type="button" className="list-links__btn" onClick={() => void signOut()}>
            تسجيل الخروج
          </button>
        </li>
      </ul>
    </div>
  )
}
