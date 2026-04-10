import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { formatAuthError } from '../lib/authErrors'
import { isSupabaseConfigured, supabaseSetupMessageAr } from '../lib/supabaseConfig'
import { ErrorBanner } from '../components/ErrorBanner'

export function RegisterPage() {
  const nav = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState<'teacher' | 'student'>('student')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [info, setInfo] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    setInfo(null)
    if (!isSupabaseConfigured()) {
      setErr(supabaseSetupMessageAr())
      return
    }
    setBusy(true)
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          role,
        },
      },
    })
    setBusy(false)
    if (error) {
      setErr(formatAuthError(error.message))
      return
    }
    if (data.user && !data.session) {
      setInfo(
        'تم إنشاء الحساب. إن كان التأكيد بالبريد مفعّلاً في Supabase، راجع صندوقك ثم سجّل الدخول.',
      )
      return
    }
    nav('/', { replace: true })
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>إنشاء حساب</h1>
        {!isSupabaseConfigured() ? (
          <div className="banner banner--error" role="alert">
            {supabaseSetupMessageAr()}
          </div>
        ) : null}
        <ErrorBanner message={err} />
        {info ? (
          <div className="banner banner--info" role="status">
            {info}
          </div>
        ) : null}
        <form className="form" onSubmit={onSubmit}>
        <label>
          الاسم الكامل
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
          />
        </label>
        <label>
          نوع الحساب
          <select
            value={role}
            onChange={(e) =>
              setRole(e.target.value === 'teacher' ? 'teacher' : 'student')
            }
          >
            <option value="student">طالب</option>
            <option value="teacher">أستاذ</option>
          </select>
        </label>
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
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />
        </label>
        <button type="submit" className="btn btn--primary" disabled={busy}>
          {busy ? 'جاري الإنشاء…' : 'تسجيل'}
        </button>
        </form>
        <p className="muted">
          لديك حساب؟ <Link to="/login">تسجيل الدخول</Link>
        </p>
      </div>
    </div>
  )
}
