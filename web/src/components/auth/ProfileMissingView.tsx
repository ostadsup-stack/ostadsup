import { useAuth } from '../../contexts/AuthContext'
import { Loading } from '../Loading'
import { ErrorBanner } from '../ErrorBanner'

/** عند وجود جلسة دون profile: إظهار الخطأ أو الاستمرار بالتحميل */
export function ProfileMissingView() {
  const { error, signOut } = useAuth()
  return (
    <div className="main main--narrow" style={{ margin: '2rem auto' }}>
      {error ? (
        <>
          <ErrorBanner message={error} />
          <p className="muted">
            إن استمرت المشكلة بعد تنفيذ SQL للدالة ensure_my_profile، جرّب تسجيل الخروج والدخول مجدداً.
          </p>
          <button type="button" className="btn btn--primary" onClick={() => void signOut()}>
            تسجيل الخروج
          </button>
        </>
      ) : (
        <Loading label="جاري تحميل الملف الشخصي…" />
      )}
    </div>
  )
}
