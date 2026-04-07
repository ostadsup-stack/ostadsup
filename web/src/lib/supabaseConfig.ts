/** يتحقق من أن متغيرات Vite ليست القيم الافتراضية من .env.example */
export function isSupabaseConfigured(): boolean {
  const url = import.meta.env.VITE_SUPABASE_URL ?? ''
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''
  if (!url.trim() || !key.trim()) return false
  if (/YOUR_PROJECT|example\.com|localhost:9999/i.test(url)) return false
  if (/^your_anon_key$/i.test(key.trim()) || key.length < 32) return false
  try {
    new URL(url)
  } catch {
    return false
  }
  return true
}

export function supabaseSetupMessageAr(): string {
  return [
    'إعدادات Supabase غير جاهزة.',
    'افتح الملف web/.env واستبدل القيم بـ Project URL و anon key من لوحة Supabase:',
    'Dashboard → Project Settings → API.',
    'ثم أعد تشغيل الأمر: npm run dev',
  ].join(' ')
}
