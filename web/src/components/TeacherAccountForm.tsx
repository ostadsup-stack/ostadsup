import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { ErrorBanner } from './ErrorBanner'
import { whatsappHref } from '../lib/whatsapp'
import type { Profile } from '../types'

const AVATAR_EXT = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp'])

function readSocial(p: Profile | null) {
  const s = p?.social_links
  if (s && typeof s === 'object' && !Array.isArray(s)) {
    return {
      linkedin: String(s.linkedin ?? ''),
      facebook: String(s.facebook ?? ''),
      twitter: String(s.twitter ?? ''),
      website: String(s.website ?? ''),
    }
  }
  return { linkedin: '', facebook: '', twitter: '', website: '' }
}

function compactSocial(s: { linkedin: string; facebook: string; twitter: string; website: string }) {
  const out: Record<string, string> = {}
  if (s.linkedin.trim()) out.linkedin = s.linkedin.trim()
  if (s.facebook.trim()) out.facebook = s.facebook.trim()
  if (s.twitter.trim()) out.twitter = s.twitter.trim()
  if (s.website.trim()) out.website = s.website.trim()
  return out
}

export function TeacherAccountForm() {
  const { session, profile, refreshProfile } = useAuth()
  const [fullName, setFullName] = useState('')
  const [specialty, setSpecialty] = useState('')
  const [phone, setPhone] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [bio, setBio] = useState('')
  const [officeHours, setOfficeHours] = useState('')
  const [social, setSocial] = useState({ linkedin: '', facebook: '', twitter: '', website: '' })
  const [err, setErr] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [cvUploading, setCvUploading] = useState(false)

  useEffect(() => {
    if (!profile) return
    setFullName(profile.full_name ?? '')
    setSpecialty(profile.specialty ?? '')
    setPhone(profile.phone ?? '')
    setWhatsapp(profile.whatsapp ?? '')
    setBio(profile.bio ?? '')
    setOfficeHours(profile.office_hours ?? '')
    setSocial(readSocial(profile))
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
    const socialClean = compactSocial(social)
    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: name,
        specialty: specialty.trim() || null,
        phone: phone.trim() || null,
        whatsapp: whatsapp.trim() || null,
        bio: bio.trim() || null,
        office_hours: officeHours.trim() || null,
        social_links: socialClean,
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
    const publicUrl = pub.publicUrl
    const { error: dbErr } = await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', uid)
    setUploading(false)
    if (dbErr) {
      setErr(dbErr.message)
      return
    }
    await refreshProfile()
  }

  async function onCvChange(e: React.ChangeEvent<HTMLInputElement>) {
    const uid = session?.user?.id
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!uid || !file) return
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      setErr('السيرة: ملف PDF فقط')
      return
    }
    setCvUploading(true)
    setErr(null)
    const path = `${uid}/cv.pdf`
    const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, {
      upsert: true,
      contentType: 'application/pdf',
    })
    if (upErr) {
      setCvUploading(false)
      setErr(upErr.message)
      return
    }
    const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path)
    const publicUrl = pub.publicUrl
    const { error: dbErr } = await supabase.from('profiles').update({ cv_path: publicUrl }).eq('id', uid)
    setCvUploading(false)
    if (dbErr) {
      setErr(dbErr.message)
      return
    }
    await refreshProfile()
  }

  if (!session?.user) return null

  const email = session.user.email ?? ''
  const waLink = whatsappHref(whatsapp)

  if (!profile) {
    return (
      <section className="section teacher-account">
        <p className="muted">جاري تحميل الملف الشخصي…</p>
      </section>
    )
  }

  return (
    <section className="section teacher-account">
      <p className="muted teacher-account__hint">
        بياناتك تظهر في صفحتك العامة عند مشاركة رابط مساحتك؛ البريد مرتبط بحساب الدخول في Supabase.
      </p>
      <ErrorBanner message={err} />

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
            <input type="file" accept="image/jpeg,image/png,image/gif,image/webp" hidden onChange={(ev) => void onAvatarChange(ev)} disabled={uploading} />
          </label>
        </div>

        <form className="form teacher-account__form" onSubmit={(e) => void saveProfile(e)}>
          <label>
            الاسم الكامل
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          </label>
          <label>
            التخصص الأكاديمي
            <input value={specialty} onChange={(e) => setSpecialty(e.target.value)} placeholder="مثال: أستاذ التحليل، كلية العلوم…" maxLength={200} />
          </label>
          <label>
            البريد الإلكتروني
            <input type="email" value={email} readOnly className="input-readonly" dir="ltr" />
          </label>
          <p className="muted small">لتغيير البريد استخدم لوحة Supabase (Auth) أو إعدادات المشروع.</p>
          <label>
            رقم الهاتف
            <input value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" className="ltr" placeholder="+212 …" />
          </label>
          <label>
            واتساب
            <input
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              dir="ltr"
              className="ltr"
              placeholder="2126… أو https://wa.me/…"
            />
          </label>
          {waLink ? (
            <p className="teacher-account__wa-preview">
              <a href={waLink} target="_blank" rel="noreferrer">
                فتح واتساب
              </a>
            </p>
          ) : null}
          <label>
            نبذة تعريفية
            <textarea rows={4} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="نبذة عنك، التخصص، الاهتمامات البحثية…" />
          </label>
          <label>
            أوقات التواصل
            <textarea
              rows={3}
              value={officeHours}
              onChange={(e) => setOfficeHours(e.target.value)}
              placeholder="مثال: الأحد والثلاثاء 10:00–12:00 — مكتب 3…"
            />
          </label>

          <h3 className="teacher-account__subheading">روابط مهنية</h3>
          <p className="muted small">اختياري؛ تُعرض في صفحتك العامة.</p>
          <label>
            LinkedIn
            <input value={social.linkedin} onChange={(e) => setSocial({ ...social, linkedin: e.target.value })} dir="ltr" className="ltr" placeholder="https://…" />
          </label>
          <label>
            Facebook
            <input value={social.facebook} onChange={(e) => setSocial({ ...social, facebook: e.target.value })} dir="ltr" className="ltr" placeholder="https://…" />
          </label>
          <label>
            X / Twitter
            <input value={social.twitter} onChange={(e) => setSocial({ ...social, twitter: e.target.value })} dir="ltr" className="ltr" placeholder="https://…" />
          </label>
          <label>
            موقع شخصي
            <input value={social.website} onChange={(e) => setSocial({ ...social, website: e.target.value })} dir="ltr" className="ltr" placeholder="https://…" />
          </label>

          <h3 className="teacher-account__subheading">السيرة الذاتية (PDF)</h3>
          <p className="muted small">يُرفع إلى التخزين العام مع صورتك؛ الرابط يظهر في الصفحة العامة.</p>
          {profile.cv_path ? (
            <p className="teacher-account__wa-preview">
              <a href={profile.cv_path} target="_blank" rel="noreferrer">
                معاينة السيرة الحالية
              </a>
            </p>
          ) : null}
          <label className="btn btn--ghost teacher-account__upload">
            {cvUploading ? 'جاري الرفع…' : 'رفع / استبدال السيرة (PDF)'}
            <input type="file" accept="application/pdf" hidden onChange={(ev) => void onCvChange(ev)} disabled={cvUploading} />
          </label>

          <button type="submit" className="btn btn--primary" disabled={saving}>
            {saving ? 'جاري الحفظ…' : 'حفظ البيانات'}
          </button>
        </form>
      </div>
    </section>
  )
}
