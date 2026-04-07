/** يبني رابط واتساب من رقم أو رابط جاهز. */
export function whatsappHref(raw: string): string | null {
  const t = raw.trim()
  if (!t) return null
  if (/^https?:\/\//i.test(t)) return t
  const digits = t.replace(/\D/g, '')
  if (digits.length >= 8) return `https://wa.me/${digits}`
  return null
}
