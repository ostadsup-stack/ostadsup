/** معرف مساحة عام في الرابط /p/{slug} — أحرف لاتينية صغيرة وأرقام وشرطة فقط. */

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const RESERVED = new Set([
  'login',
  'register',
  't',
  's',
  'p',
  'api',
  'assets',
  'static',
  'www',
  'admin',
  'null',
  'undefined',
])

export function normalizePublicWorkspaceSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

export function isValidPublicWorkspaceSlug(slug: string): boolean {
  if (slug.length < 3 || slug.length > 48) return false
  if (!SLUG_RE.test(slug)) return false
  if (RESERVED.has(slug)) return false
  return true
}

export function publicWorkspaceSlugHint(): string {
  return 'من 3 إلى 48 حرفاً: أحرف إنجليزية صغيرة وأرقام وشرطة (-) فقط، دون مسافات.'
}
