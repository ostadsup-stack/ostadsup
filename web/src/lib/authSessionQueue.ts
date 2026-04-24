/**
 * Supabase Auth يستخدم قفلاً على localStorage لمفتاح الجلسة.
 * استدعاء getSession() أو عمليات مشابهة بالتوازي قد يرمي:
 * Lock "lock:sb-...-auth-token" was released because another request stole it
 * نفّذ أي عملية تحتاج القفل بشكل متسلسل عبر نفس الطابور.
 */
let chain: Promise<unknown> = Promise.resolve()

export function runSerializedAuth<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(() => fn())
  chain = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}
