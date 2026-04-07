/** يحوّل أخطاء الشبكة إلى نص عربي أوضح للمستخدم */
export function formatAuthError(message: string): string {
  const m = message.trim()
  if (/networkerror|failed to fetch|load failed|network request failed/i.test(m)) {
    return [
      'تعذّر الاتصال بخادم Supabase.',
      'إن كان ملف web/.env ما زال يحتوي على YOUR_PROJECT أو your_anon_key فاستبدلهما بالقيم الحقيقية من لوحة المشروع (Settings → API)، ثم أعد تشغيل npm run dev.',
      'إذا كانت القيم صحيحة، تحقق من الإنترنت وحظر الإعلانات أو جدار الحماية.',
    ].join(' ')
  }
  return m
}
