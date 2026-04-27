import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { ErrorBanner } from '../../components/ErrorBanner'

function formatJoinError(message: string): string {
  if (
    message.includes('student_already_in_another_group') ||
    message.includes('group_members_one_active_student')
  ) {
    return 'أنت مسجّل بالفعل في فوج آخر كطالب. افتح صفحة فوجك واختر «مغادرة الفوج» إن أردت الانضمام إلى فوج جديد.'
  }
  if (message.includes('invalid_join_code')) return 'كود الفوج غير صالح.'
  if (message.includes('invalid_join_token')) return 'رمز الانضمام غير صالح أو منتهٍ.'
  if (message.includes('display_name_required')) return 'الاسم الظاهر مطلوب.'
  return message
}

export function JoinGroupPage() {
  const { session } = useAuth()
  const [params] = useSearchParams()
  const nav = useNavigate()
  const [code, setCode] = useState(() => params.get('code') ?? '')
  const token = params.get('t') ?? ''
  const [displayName, setDisplayName] = useState('')
  const [studentNumber, setStudentNumber] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!session?.user?.id) {
      setErr('سجّل الدخول أولاً')
      return
    }
    setBusy(true)
    setErr(null)
    const useToken = token.trim().length > 0
    const { data, error } = useToken
      ? await supabase.rpc('join_group_by_student_token', {
          p_token: token.trim(),
          p_display_name: displayName,
          p_student_number: studentNumber || null,
        })
      : await supabase.rpc('join_group_by_code', {
          p_code: code,
          p_display_name: displayName,
          p_student_number: studentNumber || null,
        })
    setBusy(false)
    if (error) {
      setErr(formatJoinError(error.message))
      return
    }
    const gid = data as string
    nav(`/s/groups/${gid}`, { replace: true })
  }

  return (
    <div className="page">
      <h1>الانضمام لفوج</h1>
      <p className="muted">أدخل كود الأستاذ واسمك كما تريد أن يظهر للأستاذ.</p>
      <ErrorBanner message={err} />
      <form className="form" onSubmit={onSubmit}>
        {token.trim() ? (
          <p className="muted small">انضمام عبر رابط آمن (QR). يمكنك تعديل الاسم فقط.</p>
        ) : null}
        <label>
          كود الفوج {token.trim() ? '(اختياري إن وُجد رمز آمن)' : null}
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            required={!token.trim()}
            disabled={!!token.trim()}
            dir="ltr"
            className="ltr"
          />
        </label>
        <label>
          الاسم الظاهر
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
        </label>
        <label>
          الرقم الجامعي (اختياري)
          <input value={studentNumber} onChange={(e) => setStudentNumber(e.target.value)} dir="ltr" className="ltr" />
        </label>
        <button type="submit" className="btn btn--primary" disabled={busy}>
          {busy ? 'جاري الانضمام…' : 'انضمام'}
        </button>
      </form>
    </div>
  )
}
