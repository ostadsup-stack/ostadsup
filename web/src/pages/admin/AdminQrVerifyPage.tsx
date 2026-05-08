import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { parseOstadiQrPayload, type OstadiQrPayload } from '../../lib/ostadiQrPayload'
import type { Profile } from '../../types'
import { IconQrScan } from '../../components/NavIcons'

const READER_ID = 'admin-qr-verify-reader'

type VerifyState =
  | { status: 'idle' }
  | { status: 'loading' }
  | {
      status: 'ok'
      payload: OstadiQrPayload
      profile: Pick<Profile, 'id' | 'full_name' | 'role' | 'avatar_url' | 'university_student_number' | 'status'>
      roleMatches: boolean
      studentNumberMatches: boolean | null
    }
  | { status: 'bad_payload'; raw: string }
  | { status: 'not_found'; payload: OstadiQrPayload }
  | { status: 'error'; message: string }

function roleLabelAr(role: string): string {
  if (role === 'student') return 'طالب'
  if (role === 'teacher') return 'أستاذ'
  if (role === 'admin') return 'مدير'
  return role
}

export function AdminQrVerifyPage() {
  const [verify, setVerify] = useState<VerifyState>({ status: 'idle' })
  const [paste, setPaste] = useState('')
  const [scannerOn, setScannerOn] = useState(false)
  const html5Ref = useRef<{ stop: () => Promise<void> } | null>(null)
  const busyRef = useRef(false)
  const lockedRef = useRef(false)

  const applyDecoded = useCallback(async (raw: string) => {
    const trimmed = raw.trim()
    if (!trimmed || busyRef.current || lockedRef.current) return
    const payload = parseOstadiQrPayload(trimmed)
    if (!payload) {
      setVerify({ status: 'bad_payload', raw: trimmed.slice(0, 500) })
      return
    }
    busyRef.current = true
    setVerify({ status: 'loading' })
    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('id, full_name, role, avatar_url, university_student_number, status')
        .eq('id', payload.id)
        .maybeSingle()
      if (error) {
        setVerify({ status: 'error', message: error.message || 'فشل الجلب' })
        lockedRef.current = true
        return
      }
      if (!profile) {
        setVerify({ status: 'not_found', payload })
        lockedRef.current = true
        return
      }
      const roleMatches = profile.role === payload.role
      let studentNumberMatches: boolean | null = null
      if (payload.role === 'student' && payload.sn) {
        const dbSn = profile.university_student_number?.trim() ?? ''
        studentNumberMatches = dbSn === payload.sn
      }
      setVerify({
        status: 'ok',
        payload,
        profile,
        roleMatches,
        studentNumberMatches,
      })
      lockedRef.current = true
    } finally {
      busyRef.current = false
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const mod = await import('html5-qrcode')
      if (cancelled) return
      const Html5Qrcode = mod.Html5Qrcode
      const el = document.getElementById(READER_ID)
      if (!el) return
      const html5 = new Html5Qrcode(READER_ID)
      html5Ref.current = html5
      setScannerOn(true)
      try {
        await html5.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 260, height: 260 }, aspectRatio: 1 },
          (text) => {
            void applyDecoded(text)
          },
          () => {},
        )
      } catch {
        setScannerOn(false)
        html5Ref.current = null
      }
    })()
    return () => {
      cancelled = true
      const h = html5Ref.current
      html5Ref.current = null
      setScannerOn(false)
      if (h) {
        void h.stop().catch(() => {})
      }
    }
  }, [applyDecoded])

  const reset = () => {
    lockedRef.current = false
    busyRef.current = false
    setVerify({ status: 'idle' })
  }

  const onPasteVerify = () => {
    lockedRef.current = false
    busyRef.current = false
    void applyDecoded(paste)
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="space-y-1">
        <div className="flex items-center gap-2 text-slate-900 dark:text-white">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/15 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300">
            <IconQrScan className="h-5 w-5" />
          </span>
          <h1 className="text-xl font-bold tracking-tight">التحقق من رمز QR</h1>
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          امسح الرمز المعروض في بطاقة هوية الطالب أو بطاقة الأستاذ أو أي حمولة Ostadi صالحة لمطابقة الحساب مع قاعدة البيانات.
        </p>
      </header>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900/40">
        <div id={READER_ID} className="min-h-[240px] w-full bg-black/90 [&_video]:mx-auto [&_video]:max-h-[360px]" />
        {!scannerOn ? (
          <p className="border-t border-slate-200 px-4 py-3 text-center text-sm text-amber-700 dark:border-slate-700 dark:text-amber-300">
            تعذّر تشغيل الكاميرا أو لا يتوفر مسح مباشر. يمكنك لصق نص الرمز يدوياً أدناه.
          </p>
        ) : null}
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900/40">
        <h2 className="mb-2 text-sm font-semibold text-slate-800 dark:text-slate-100">لصق نص الحمولة</h2>
        <textarea
          dir="ltr"
          className="mb-3 min-h-[88px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
          placeholder='{"v":1,"app":"ostadi",...}'
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
        />
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn--primary" onClick={() => void onPasteVerify()}>
            تحقق
          </button>
          <button type="button" className="btn btn--ghost" onClick={reset}>
            مسح النتيجة
          </button>
        </div>
      </section>

      <VerifyPanel verify={verify} onReset={reset} />
    </div>
  )
}

function VerifyPanel({ verify, onReset }: { verify: VerifyState; onReset: () => void }) {
  if (verify.status === 'idle') return null
  if (verify.status === 'loading') {
    return (
      <p className="text-center text-sm text-slate-600 dark:text-slate-400" dir="rtl">
        جاري التحقق…
      </p>
    )
  }
  if (verify.status === 'bad_payload') {
    return (
      <div
        className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100"
        dir="rtl"
      >
        <p className="font-semibold">الرمز لا يطابق تنسيق Ostadi.</p>
        <p className="mt-1 text-xs opacity-90">تأكد أن الرمز يخص هذا التطبيق.</p>
        <button type="button" className="btn btn--ghost mt-3 text-xs" onClick={onReset}>
          إعادة المحاولة
        </button>
      </div>
    )
  }
  if (verify.status === 'not_found') {
    return (
      <div
        className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-950 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-100"
        dir="rtl"
      >
        <p className="font-semibold">لم يُعثر على مستخدم بهذا المعرّف.</p>
        <p className="mt-1 font-mono text-xs" dir="ltr">
          {verify.payload.id}
        </p>
        <button type="button" className="btn btn--ghost mt-3 text-xs" onClick={onReset}>
          إعادة المحاولة
        </button>
      </div>
    )
  }
  if (verify.status === 'error') {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-100" dir="rtl">
        <p>{verify.message}</p>
        <button type="button" className="btn btn--ghost mt-3 text-xs" onClick={onReset}>
          إعادة المحاولة
        </button>
      </div>
    )
  }

  const { payload, profile, roleMatches, studentNumberMatches } = verify
  const ok =
    roleMatches && (studentNumberMatches === null || studentNumberMatches === true)

  return (
    <div
      className={`rounded-2xl border p-4 text-sm dark:border-slate-600 ${
        ok
          ? 'border-emerald-200 bg-emerald-50 text-emerald-950 dark:bg-emerald-950/35 dark:text-emerald-50'
          : 'border-amber-200 bg-amber-50 text-amber-950 dark:bg-amber-950/35 dark:text-amber-50'
      }`}
      dir="rtl"
    >
      <p className="text-base font-bold">{ok ? '✓ هوية مطابقة' : '⚠ اختلاف في البيانات'}</p>
      <dl className="mt-3 space-y-2">
        <div className="flex flex-wrap justify-between gap-2">
          <dt className="text-slate-600 dark:text-slate-400">الاسم</dt>
          <dd className="font-medium">{profile.full_name?.trim() || '—'}</dd>
        </div>
        <div className="flex flex-wrap justify-between gap-2">
          <dt className="text-slate-600 dark:text-slate-400">الدور في المنصّة</dt>
          <dd>
            {roleLabelAr(profile.role)}
            {!roleMatches ? (
              <span className="mr-2 text-xs text-amber-800 dark:text-amber-200">
                (الرمز يشير إلى {roleLabelAr(payload.role)})
              </span>
            ) : null}
          </dd>
        </div>
        <div className="flex flex-wrap justify-between gap-2">
          <dt className="text-slate-600 dark:text-slate-400">الحالة</dt>
          <dd className="font-mono text-xs" dir="ltr">
            {profile.status}
          </dd>
        </div>
        {payload.sn ? (
          <div className="flex flex-wrap justify-between gap-2">
            <dt className="text-slate-600 dark:text-slate-400">الرقم الجامعي في الرمز</dt>
            <dd className="font-mono text-xs" dir="ltr">
              {payload.sn}
              {studentNumberMatches === false ? (
                <span className="mr-2 text-amber-800 dark:text-amber-200">لا يطابق الملف</span>
              ) : null}
            </dd>
          </div>
        ) : null}
      </dl>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          to={
            profile.role === 'teacher'
              ? '/admin/teachers'
              : profile.role === 'student'
                ? '/admin/students'
                : '/admin/dashboard'
          }
          className="btn btn--primary text-xs"
        >
          الانتقال إلى القائمة المناسبة
        </Link>
        <button type="button" className="btn btn--ghost text-xs" onClick={onReset}>
          مسح النتيجة
        </button>
      </div>
    </div>
  )
}
