import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { formatAppDateTime } from '../../lib/appDateTime'
import { Loading } from '../../components/Loading'
import { ErrorBanner } from '../../components/ErrorBanner'
import { EmptyState } from '../../components/EmptyState'
import { PageHeader } from '../../components/PageHeader'

type InviteRole = 'teacher' | 'student'

type InvitationRow = {
  id: string
  email: string
  invited_role: InviteRole
  status: string
  created_at: string
}

function statusLabel(s: string): string {
  if (s === 'pending') return 'معلّقة'
  if (s === 'accepted') return 'مقبولة'
  if (s === 'revoked') return 'ملغاة'
  if (s === 'expired') return 'منتهية'
  return s
}

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i

export function AdminInvitationsPage() {
  const [searchParams] = useSearchParams()
  const { session, profile } = useAuth()
  const [rows, setRows] = useState<InvitationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<InviteRole>('student')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    const r = searchParams.get('role')
    if (r === 'teacher' || r === 'student') setRole(r)
  }, [searchParams])

  const reload = useCallback(async () => {
    if (!session?.user?.id) {
      setRows([])
      return
    }
    setErr(null)
    setLoading(true)
    const { data, error } = await supabase
      .from('app_invitations')
      .select('id, email, invited_role, status, created_at')
      .order('created_at', { ascending: false })
    if (error) {
      setErr(error.message)
      setRows([])
    } else {
      setRows((data as InvitationRow[]) ?? [])
    }
    setLoading(false)
  }, [session?.user?.id])

  useEffect(() => {
    void reload()
  }, [reload])

  async function onSend(e: React.FormEvent) {
    e.preventDefault()
    const em = email.trim()
    if (!em || !emailRe.test(em)) {
      setErr('أدخل بريداً إلكترونياً صالحاً.')
      return
    }
    if (!profile?.id) {
      setErr('تعذر تحميل الملف.')
      return
    }
    setSending(true)
    setErr(null)
    const { error } = await supabase.from('app_invitations').insert({
      email: em.toLowerCase(),
      invited_role: role,
      created_by: profile.id,
    })
    setSending(false)
    if (error) {
      if (error.code === '23505' || String(error.message).toLowerCase().includes('unique')) {
        setErr('دعوة معلّقة مسبقاً لنفس البريد ونفس الدور.')
      } else {
        setErr(error.message)
      }
      return
    }
    setEmail('')
    void reload()
  }

  if (loading) return <Loading label="جاري تحميل الدعوات…" />

  return (
    <div className="page">
      <PageHeader
        title="نظام الدعوات"
        subtitle="تسجيل دعوة بالبريد لدور أستاذ أو طالب. يمكن فتح هذه الصفحة من قسم الأساتذة أو الطلبة لاختيار الدور مسبقاً. إرسال بريد حقيقي قد يرتبط بخدمة خادم لاحقاً؛ السجل يبقى للمتابعة."
      />
      <ErrorBanner message={err} />

      <section className="section">
        <h2>إرسال دعوة</h2>
        <form className="form admin-invite-form" onSubmit={(e) => void onSend(e)}>
          <label>
            البريد الإلكتروني
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              inputMode="email"
              dir="ltr"
              className="input--ltr"
              placeholder="name@example.com"
            />
          </label>
          <label>
            الدور
            <select value={role} onChange={(e) => setRole(e.target.value as InviteRole)}>
              <option value="teacher">أستاذ</option>
              <option value="student">طالب</option>
            </select>
          </label>
          <div className="admin-invite-form__submit">
            <button type="submit" className="btn btn--primary" disabled={sending}>
              {sending ? 'جاري التسجيل…' : 'إرسال الدعوة'}
            </button>
          </div>
        </form>
      </section>

      <section className="section">
        <h2>الدعوات المرسلة</h2>
        {rows.length === 0 ? (
          <EmptyState title="لا دعوات بعد" hint="سجّل دعوة باستخدام النموذج أعلاه." />
        ) : (
          <div className="admin-cohorts__table-wrap" role="region" aria-label="قائمة الدعوات">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>البريد</th>
                  <th>الدور</th>
                  <th>الحالة</th>
                  <th>التاريخ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td data-label="البريد" dir="ltr" className="input--ltr">
                      {r.email}
                    </td>
                    <td data-label="الدور">{r.invited_role === 'teacher' ? 'أستاذ' : 'طالب'}</td>
                    <td data-label="الحالة">
                      <span
                        className={
                          r.status === 'pending'
                            ? 'pill'
                            : r.status === 'accepted'
                              ? 'pill pill--ok'
                              : 'pill'
                        }
                      >
                        {statusLabel(r.status)}
                      </span>
                    </td>
                    <td className="muted" data-label="التاريخ" title={r.created_at}>
                      {formatAppDateTime(r.created_at, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
