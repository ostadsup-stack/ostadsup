import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { Loading } from '../../components/Loading'
import { ErrorBanner } from '../../components/ErrorBanner'
import type { TeacherAchievement } from '../../types'

export function TeacherAchievementsPage() {
  const { session } = useAuth()
  const uid = session?.user?.id
  const [rows, setRows] = useState<TeacherAchievement[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [title, setTitle] = useState('')
  const [year, setYear] = useState('')
  const [details, setDetails] = useState('')
  const [url, setUrl] = useState('')
  const [sortOrder, setSortOrder] = useState('0')

  const load = useCallback(async () => {
    if (!uid) return
    setErr(null)
    const { data, error } = await supabase
      .from('teacher_achievements')
      .select('*')
      .eq('teacher_id', uid)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false })
    if (error) {
      setErr(error.message)
      setRows([])
    } else {
      setRows((data as TeacherAchievement[]) ?? [])
    }
    setLoading(false)
  }, [uid])

  useEffect(() => {
    if (!uid) return
    void load()
  }, [uid, load])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!uid || !title.trim()) return
    setSaving(true)
    setErr(null)
    const y = year.trim() === '' ? null : Number.parseInt(year, 10)
    const so = Number.parseInt(sortOrder, 10)
    const { error } = await supabase.from('teacher_achievements').insert({
      teacher_id: uid,
      title: title.trim(),
      year: Number.isFinite(y as number) ? y : null,
      details: details.trim() || null,
      url: url.trim() || null,
      sort_order: Number.isFinite(so) ? so : 0,
    })
    setSaving(false)
    if (error) {
      setErr(error.message)
      return
    }
    setTitle('')
    setYear('')
    setDetails('')
    setUrl('')
    setSortOrder('0')
    await load()
  }

  async function removeRow(id: string) {
    if (!uid) return
    setErr(null)
    const { error } = await supabase.from('teacher_achievements').delete().eq('id', id).eq('teacher_id', uid)
    if (error) setErr(error.message)
    else await load()
  }

  if (!uid) return <Loading />

  return (
    <div className="page">
      <h1 className="page-header__title">إنجازاتي العلمية</h1>
      <ErrorBanner message={err} />
      <section className="teacher-account__card teacher-achievements__form-card">
        <h2 className="teacher-achievements__h2">إضافة إنجاز</h2>
        <form className="form teacher-account__form" onSubmit={handleAdd}>
          <label>
            العنوان
            <input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200} />
          </label>
          <label>
            السنة (اختياري)
            <input
              type="number"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              placeholder="مثال: 2024"
            />
          </label>
          <label>
            تفاصيل (اختياري)
            <textarea value={details} onChange={(e) => setDetails(e.target.value)} rows={3} />
          </label>
          <label>
            رابط (اختياري)
            <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" dir="ltr" className="ltr" />
          </label>
          <label>
            ترتيب العرض
            <input type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
          </label>
          <button type="submit" className="btn btn--primary" disabled={saving}>
            {saving ? 'جاري الحفظ…' : 'إضافة'}
          </button>
        </form>
      </section>

      {loading ? (
        <Loading label="جاري التحميل…" />
      ) : rows.length === 0 ? (
        <p className="muted">لا توجد إنجازات مضافة بعد.</p>
      ) : (
        <ul className="teacher-achievements__list">
          {rows.map((r) => (
            <li key={r.id} className="teacher-achievements__item">
              <div className="teacher-achievements__item-head">
                <strong>{r.title}</strong>
                {r.year != null ? <span className="badge">{r.year}</span> : null}
              </div>
              {r.details ? <p className="teacher-achievements__details">{r.details}</p> : null}
              {r.url ? (
                <a href={r.url} target="_blank" rel="noreferrer noopener" className="link-out">
                  فتح الرابط
                </a>
              ) : null}
              <div className="teacher-achievements__item-actions">
                <button type="button" className="btn btn--ghost" onClick={() => void removeRow(r.id)}>
                  حذف
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
