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
import { runSerializedAuth } from '../lib/authSessionQueue'
import { supabase } from '../lib/supabase'
import type { Profile } from '../types'

const PROFILE_LOAD_TIMEOUT_MS = 16_000
const SESSION_GET_TIMEOUT_MS = 12_000

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = window.setTimeout(() => reject(new Error('TIMEOUT')), ms)
    promise.then(
      (v) => {
        window.clearTimeout(id)
        resolve(v)
      },
      (e) => {
        window.clearTimeout(id)
        reject(e)
      },
    )
  })
}

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
  /** بعد أول جولة getSession + loadProfile (نجاح أو فشل) */
  const initialAuthResolved = useRef(false)
  const sessionRef = useRef<Session | null>(null)
  sessionRef.current = session

  const loadProfile = useCallback(async (userId: string, opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true
    if (!silent) setError(null)

    const run = async (): Promise<void> => {
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
    }

    try {
      await withTimeout(run(), PROFILE_LOAD_TIMEOUT_MS)
    } catch (err) {
      const timedOut = err instanceof Error && err.message === 'TIMEOUT'
      if (timedOut) {
        if (!silent) {
          setError(
            'تأخر الاتصال بالخادم أو انقطع. تحقق من الشبكة ثم حدّث الصفحة أو أعد المحاولة لاحقاً.',
          )
          setProfile(null)
        }
      } else if (!silent && err instanceof Error) {
        setError(err.message)
        setProfile(null)
      }
    }
  }, [])

  const refreshProfile = useCallback(async () => {
    const uid = session?.user?.id
    if (!uid) {
      setProfile(null)
      return
    }
    await loadProfile(uid)
  }, [loadProfile, session?.user?.id])

  const resumeAuthRefreshInner = useCallback(() => {
    try {
      const auth = supabase.auth as unknown as { startAutoRefresh?: () => void }
      auth.startAutoRefresh?.()
    } catch {
      /* ignore */
    }
    void (async () => {
      let uid: string | undefined
      try {
        const { data } = await withTimeout(
          runSerializedAuth(() => supabase.auth.getSession()),
          SESSION_GET_TIMEOUT_MS,
        )
        uid = data.session?.user?.id
        setSession(data.session)
      } catch {
        uid = sessionRef.current?.user?.id
      }
      if (!uid) {
        if (initialAuthResolved.current) setLoading(false)
        return
      }
      await loadProfile(uid, { silent: true }).finally(() => {
        if (initialAuthResolved.current) setLoading(false)
      })
    })()
  }, [loadProfile])

  const resumeDebounceRef = useRef<number | null>(null)
  const resumeAuthRefresh = useCallback(() => {
    if (resumeDebounceRef.current != null) window.clearTimeout(resumeDebounceRef.current)
    resumeDebounceRef.current = window.setTimeout(() => {
      resumeDebounceRef.current = null
      resumeAuthRefreshInner()
    }, 320)
  }, [resumeAuthRefreshInner])

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible') resumeAuthRefresh()
    }
    const onOnline = () => resumeAuthRefresh()
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('online', onOnline)
    return () => {
      if (resumeDebounceRef.current != null) window.clearTimeout(resumeDebounceRef.current)
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('online', onOnline)
    }
  }, [resumeAuthRefresh])

  useEffect(() => {
    let cancelled = false
    initialAuthResolved.current = false
    ;(async () => {
      try {
        const { data } = await withTimeout(
          runSerializedAuth(() => supabase.auth.getSession()),
          SESSION_GET_TIMEOUT_MS,
        )
        if (cancelled) return
        setSession(data.session)
        if (data.session?.user?.id) await loadProfile(data.session.user.id)
        else setProfile(null)
      } catch {
        if (!cancelled) {
          setError(
            'تعذر التحقق من الجلسة (انتهت مهلة الاتصال). تحقق من الشبكة ثم حدّث الصفحة.',
          )
          setSession(null)
          setProfile(null)
        }
      } finally {
        if (!cancelled) {
          initialAuthResolved.current = true
          setLoading(false)
        }
      }
    })()
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      void runSerializedAuth(async () => {
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
    })
    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [loadProfile])

  const signOut = useCallback(async () => {
    ensuredForUser.current = null
    await runSerializedAuth(() => supabase.auth.signOut())
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
