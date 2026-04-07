import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Profile } from '../types'

type AuthState = {
  session: Session | null
  profile: Profile | null
  loading: boolean
  error: string | null
  refreshProfile: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  /** يمنع حلقة لا نهائية عند استدعاء ensure_my_profile */
  const ensuredForUser = useRef<string | null>(null)

  const loadProfile = useCallback(async (userId: string) => {
    setError(null)
    const { data, error: e } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle()
    if (e) {
      setError(e.message)
      setProfile(null)
      return
    }
    if (data) {
      setProfile(data as Profile)
      return
    }
    // جلسة بدون صف profiles (شائع بعد تأكيد البريد إن فات المستخدم المشغّل)
    if (ensuredForUser.current !== userId) {
      ensuredForUser.current = userId
      const { error: rpcErr } = await supabase.rpc('ensure_my_profile')
      if (rpcErr) {
        setError(
          rpcErr.message.includes('function') && rpcErr.message.includes('does not exist')
            ? 'نفّذ في Supabase ملف الهجرة ensure_my_profile (أو SQL الدالة ensure_my_profile) ثم حدّث الصفحة.'
            : rpcErr.message,
        )
        setProfile(null)
        return
      }
      const { data: again, error: e2 } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle()
      if (e2) {
        setError(e2.message)
        setProfile(null)
        return
      }
      setProfile((again as Profile) ?? null)
      if (!again) {
        setError('تعذّر إنشاء الملف الشخصي. جرّب تسجيل الخروج ثم الدخول من جديد.')
      }
      return
    }
    setProfile(null)
    setError(
      'لا يوجد ملف شخصي مرتبط بحسابك. سجّل الخروج ثم أعد الدخول، أو راجع إعداد قاعدة البيانات.',
    )
  }, [])

  const refreshProfile = useCallback(async () => {
    const uid = session?.user?.id
    if (!uid) {
      setProfile(null)
      return
    }
    await loadProfile(uid)
  }, [loadProfile, session?.user?.id])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data } = await supabase.auth.getSession()
      if (cancelled) return
      setSession(data.session)
      if (data.session?.user?.id) await loadProfile(data.session.user.id)
      else setProfile(null)
      setLoading(false)
    })()
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, s) => {
      setSession(s)
      if (s?.user?.id) {
        setLoading(true)
        try {
          await loadProfile(s.user.id)
        } finally {
          setLoading(false)
        }
      } else {
        ensuredForUser.current = null
        setProfile(null)
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [loadProfile])

  const signOut = useCallback(async () => {
    ensuredForUser.current = null
    await supabase.auth.signOut()
    setProfile(null)
  }, [])

  const value = useMemo(
    () => ({
      session,
      profile,
      loading,
      error,
      refreshProfile,
      signOut,
    }),
    [session, profile, loading, error, refreshProfile, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth outside AuthProvider')
  return ctx
}
