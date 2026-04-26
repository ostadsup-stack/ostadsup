import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Loading } from '../components/Loading'
import { ErrorBanner } from '../components/ErrorBanner'

export function HomeRedirect() {
  const { session, profile, loading, error, signOut } = useAuth()
  if (loading) return <Loading label="جاري تحميل الملف…" />
  if (!session) return <Navigate to="/login" replace />
  if (!profile) {
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
          <Loading label="جاري تحميل الملف…" />
        )}
      </div>
    )
  }
  if (profile.role === 'admin') return <Navigate to="/admin/dashboard" replace />
  if (profile.role === 'teacher') return <Navigate to="/t" replace />
  return <Navigate to="/s" replace />
}
