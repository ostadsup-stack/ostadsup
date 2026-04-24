/**
 * Supabase Auth يستخدم قفلاً على localStorage لمفتاح الجلسة.
 * استدعاء getSession() أو عمليات مشابهة بالتوازي قد يرمي:
 * Lock "lock:sb-...-auth-token" was released because another request stole it
 * نفّذ أي عملية تحتاج القفل بشكل متسلسل عبر نفس الطابور، مع إعادة محاولة قصيرة عند تعارض القفل.
 */

const AUTH_LOCK_PATTERN = /stole it|lock:sb-[^\s]+-auth-token/i

export function isAuthStorageLockError(e: unknown): boolean {
  if (e == null) return false
  if (e instanceof Error) return AUTH_LOCK_PATTERN.test(e.message)
  if (typeof e === 'object' && 'message' in e && typeof (e as { message: unknown }).message === 'string') {
    return AUTH_LOCK_PATTERN.test((e as { message: string }).message)
  }
  return false
}

function isAuthResultWithError(v: unknown): v is { error: Error | null } {
  return typeof v === 'object' && v !== null && 'error' in v
}

/** إعادة محاولة قصيرة عند تعارض قفل التخزين (شائع على الجوال مع طلبات متوازية). */
async function withAuthLockRetries<T>(fn: () => Promise<T>): Promise<T> {
  const maxAttempts = 5
  const baseMs = 45
  let last: unknown
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, baseMs * attempt))
    }
    try {
      const out = await fn()
      if (isAuthResultWithError(out)) {
        const err = out.error
        if (err && isAuthStorageLockError(err)) {
          last = err
          continue
        }
      }
      return out
    } catch (e) {
      last = e
      if (!isAuthStorageLockError(e)) throw e
      if (attempt === maxAttempts - 1) throw e
    }
  }
  throw last
}

let chain: Promise<unknown> = Promise.resolve()

export function runSerializedAuth<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(() => withAuthLockRetries(fn))
  chain = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}
