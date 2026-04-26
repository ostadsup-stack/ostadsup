import { useAuth } from '../contexts/AuthContext'

/**
 * يعيد true عندما يكون المستخدم الحالي مديراً (بعد انتهاء التحميل).
 * للاستخدام في واجهة فقط — الحماية الحقيقية تبقى في المسار عبر `RequireAdmin`.
 */
export function useIsAdmin(): { isAdmin: boolean; loading: boolean } {
  const { profile, loading } = useAuth()
  if (loading) return { isAdmin: false, loading: true }
  return { isAdmin: profile?.role === 'admin', loading: false }
}
