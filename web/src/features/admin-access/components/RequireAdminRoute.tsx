import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../../../contexts/AuthContext'
import { supabase } from '../../../lib/supabase'
import { ProfileMissingView } from '../../../components/auth/ProfileMissingView'
import { verifyAdminRoleFromDb } from '../lib/verifyAdminRoleFromDb'
import { AdminAccessLoading } from './AdminAccessLoading'

type Gate =
  | { kind: 'loading_auth' }
  | { kind: 'loading_role' }
  | { kind: 'guest' }
  | { kind: 'missing_profile' }
  | { kind: 'forbidden' }
  | { kind: 'ok' }

/**
 * يحمي شجرة مسارات `/admin`: جلسة Supabase + دور `admin` من جدول profiles.
 * غير المديرين يُعاد توجيههم إلى `/`.
 */
export function RequireAdminRoute({ children }: { children: React.ReactNode }) {
  const { session, profile, loading: authLoading } = useAuth()
  const [gate, setGate] = useState<Gate>({ kind: 'loading_auth' })

  useEffect(() => {
    if (authLoading) {
      setGate({ kind: 'loading_auth' })
      return
    }
    if (!session?.user) {
      setGate({ kind: 'guest' })
      return
    }
    if (!profile) {
      setGate({ kind: 'missing_profile' })
      return
    }

    let cancelled = false
    setGate({ kind: 'loading_role' })
    ;(async () => {
      const result = await verifyAdminRoleFromDb(supabase, session.user.id)
      if (cancelled) return
      if (!result.ok) {
        setGate({ kind: 'forbidden' })
        return
      }
      if (result.role !== 'admin') {
        setGate({ kind: 'forbidden' })
        return
      }
      setGate({ kind: 'ok' })
    })()

    return () => {
      cancelled = true
    }
  }, [authLoading, session?.user?.id, profile?.id])

  if (gate.kind === 'loading_auth' || gate.kind === 'loading_role') {
    return <AdminAccessLoading />
  }
  if (gate.kind === 'guest') {
    return <Navigate to="/login" replace />
  }
  if (gate.kind === 'missing_profile') {
    return <ProfileMissingView />
  }
  if (gate.kind === 'forbidden') {
    return <Navigate to="/" replace />
  }
  return <>{children}</>
}
