import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { formatAuthError } from '../lib/authErrors'
import { isSupabaseConfigured, supabaseSetupMessageAr } from '../lib/supabaseConfig'
import { ErrorBanner } from '../components/ErrorBanner'
import loginHero from '../assets/login-hero.png'

export function LoginPage() {
  const nav = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    if (!isSupabaseConfigured()) {
      setErr(supabaseSetupMessageAr())
      return
    }
    setBusy(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setBusy(false)
    if (error) {
      setErr(formatAuthError(error.message))
      return
    }
    nav('/', { replace: true })
  }

  return (
    <div className="auth-page">
      <div className="auth-page__hero">
        <img
          src={loginHero}
          width={560}
          height={700}
          decoding="async"
          alt=""
          className="auth-page__hero-img"
        />
      </div>
      <div className="auth-card">
        <h1>تسجيل الدخول</h1>
        {!isSupabaseConfigured() ? (
          <div className="banner banner--error" role="alert">
            {supabaseSetupMessageAr()}
          </div>
        ) : null}
        <ErrorBanner message={err} />
        <form className="form" onSubmit={onSubmit}>
        <label>
          البريد
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label>
          كلمة المرور
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        <button type="submit" className="btn btn--primary" disabled={busy}>
          {busy ? 'جاري الدخول…' : 'دخول'}
        </button>
        </form>
        <p className="muted">
          ليس لديك حساب؟ <Link to="/register">إنشاء حساب</Link>
        </p>
      </div>
    </div>
  )
}
