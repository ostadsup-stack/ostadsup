/** حمولة QR الموحّدة لتطبيق Ostadi — طالب / أستاذ / مدير */

export type OstadiQrRole = 'student' | 'teacher' | 'admin'

export type OstadiQrPayload = {
  v: number
  app: 'ostadi'
  role: OstadiQrRole
  id: string
  sn?: string
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function buildStudentQrPayload(userId: string, studentNumber: string | null): string {
  const o: Record<string, unknown> = {
    v: 1,
    app: 'ostadi',
    role: 'student',
    id: userId,
  }
  const sn = studentNumber?.trim()
  if (sn) o.sn = sn
  return JSON.stringify(o)
}

export function buildTeacherQrPayload(userId: string): string {
  return JSON.stringify({
    v: 1,
    app: 'ostadi',
    role: 'teacher',
    id: userId,
  })
}

export function parseOstadiQrPayload(raw: string): OstadiQrPayload | null {
  try {
    const o = JSON.parse(raw) as Record<string, unknown>
    if (o.app !== 'ostadi') return null
    if (typeof o.id !== 'string' || !UUID_RE.test(o.id)) return null
    const role = o.role
    if (role !== 'student' && role !== 'teacher' && role !== 'admin') return null
    const v = typeof o.v === 'number' && Number.isFinite(o.v) ? o.v : 1
    const sn = typeof o.sn === 'string' && o.sn.trim() ? o.sn.trim() : undefined
    return {
      v,
      app: 'ostadi',
      role,
      id: o.id,
      sn,
    }
  } catch {
    return null
  }
}
