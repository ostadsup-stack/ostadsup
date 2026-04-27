import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { whatsappHref } from '../../lib/whatsapp'
import { ErrorBanner } from '../../components/ErrorBanner'
import { PageHeader } from '../../components/PageHeader'
import { Loading } from '../../components/Loading'

const AVATAR_EXT = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp'])

export function StudentAccountPage() {
  const { session, profile, refreshProfile } = useAuth()
  const [fullName, setFullName] = useState('')
  const [universityStudentNumber, setUniversityStudentNumber] = useState('')
  const [phone, setPhone] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    if (!profile) return
    setFullName(profile.full_name ?? '')
    setUniversityStudentNumber(profile.university_student_number ?? '')
    setPhone(profile.phone ?? '')
    setWhatsapp(profile.whatsapp ?? '')
  }, [profile])

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault()
    const uid = session?.user?.id
    if (!uid) return
    const name = fullName.trim()
    if (!name) {
      setErr('الاسم الكامل مطلوب')
      return
    }
    setSaving(true)
    setErr(null)
    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: name,
        university_student_number: universityStudentNumber.trim() || null,
        phone: phone.trim() || null,
        whatsapp: whatsapp.trim() || null,
      })
      .eq('id', uid)
    setSaving(false)
    if (error) {
      setErr(error.message)
      return
    }
    await refreshProfile()
  }

  async function onAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const uid = session?.user?.id
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!uid || !file) return
    const ext = (file.name.split('.').pop() ?? '').toLowerCase()
    if (!AVATAR_EXT.has(ext)) {
      setErr('الصورة: jpg أو png أو gif أو webp فقط')
      return
    }
    setUploading(true)
    setErr(null)
    const path = `${uid}/avatar.${ext}`
    const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, {
      upsert: true,
      contentType: file.type || `image/${ext}`,
    })
    if (upErr) {
      setUploading(false)
      setErr(upErr.message)
      return
    }
    const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path)
    const { error: dbErr } = await supabase.from('profiles').update({ avatar_url: pub.publicUrl }).eq('id', uid)
    setUploading(false)
    if (dbErr) {
      setErr(dbErr.message)
      return
    }
    await refreshProfile()
  }

  if (!session?.user) return <Loading />
  if (!profile) return <Loading label="جاري التحميل…" />

  const email = session.user.email ?? ''
  const waLink = whatsappHref(whatsapp)

  return (
    <div className="page">
      <p className="breadcrumb">
        <Link to="/s">الرئيسية</Link> / بياناتي
      </p>
      <PageHeader
        title="بياناتي"
        subtitle="تعديل الاسم والرقم الجامعي والهاتف وواتساب الظاهرة للأستاذ والمنسق ومساعدي الفوج ضمن نفس المساحة."
      />
      <p className="muted small">
        البريد المعروض لهم هو بريد تسجيل الحساب ولا يُعدّل من هنا.
      </p>
      <ErrorBanner message={err} />

      <section className="section teacher-account">
        <div className="teacher-account__card">
          <div className="teacher-account__avatar-block">
            <div className="teacher-account__avatar-wrap">
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt="" className="teacher-account__avatar" />
              ) : (
                <div className="teacher-account__avatar teacher-account__avatar--placeholder" aria-hidden>
                  {fullName.trim().charAt(0) || '?'}
                </div>
              )}
            </div>
            <label className="btn btn--ghost teacher-account__upload">
              {uploading ? 'جاري الرفع…' : 'رفع صورة شخصية'}
              <input
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                hidden
                onChange={(ev) => void onAvatarChange(ev)}
                disabled={uploading}
              />
            </label>
          </div>

          <form className="form teacher-account__form" onSubmit={(e) => void saveProfile(e)}>
            <label>
              الاسم الكامل
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            </label>
            <label>
              الرقم الجامعي
              <input
                value={universityStudentNumber}
                onChange={(e) => setUniversityStudentNumber(e.target.value)}
                dir="ltr"
                className="input--ltr"
                placeholder="مثال: 2024123456"
                autoComplete="off"
              />
            </label>
            <label>
              البريد الإلكتروني
              <input type="email" value={email} readOnly className="input-readonly" dir="ltr" />
            </label>
            <label>
              الهاتف
              <input value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" className="input--ltr" />
            </label>
            <label>
              واتساب
              <input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} dir="ltr" className="input--ltr" />
            </label>
            {waLink ? (
              <p className="muted small">
                <a href={waLink} target="_blank" rel="noreferrer">
                  فتح واتساب
                </a>
              </p>
            ) : null}
            <button type="submit" className="btn btn--primary" disabled={saving}>
              {saving ? 'جاري الحفظ…' : 'حفظ التعديلات'}
            </button>
          </form>
        </div>
      </section>
    </div>
  )
}
