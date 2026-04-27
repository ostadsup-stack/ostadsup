import { jitsiUrlForPublicWorkspaceSlug, liveSessionPublicPagePath } from './publicLiveLinks'

export type MeetingProvider = 'jitsi' | 'google_meet' | 'custom'

export function normalizeMeetingProvider(raw: string | null | undefined): MeetingProvider {
  if (raw === 'google_meet' || raw === 'custom') return raw
  return 'jitsi'
}

export function normalizedMeetingLink(raw: string | null | undefined): string | null {
  const t = raw?.trim() ?? ''
  if (!t) return null
  return /^https?:\/\//i.test(t) ? t : `https://${t.replace(/^\/+/, '')}`
}

/**
 * رابط دخول الطالب لحصة أونلاين؛ null إن عُطّل البث من الأستاذ أو لا يوجد رابط مناسب.
 */
export function studentOnlineJoinUrl(args: {
  mode: string
  meetingProvider?: string | null
  onlineJoinEnabled?: boolean | null
  meetingLink?: string | null
  workspacePublicSlug: string | null | undefined
}): string | null {
  if (args.mode !== 'online') return null
  if (args.onlineJoinEnabled === false) return null
  const prov = normalizeMeetingProvider(args.meetingProvider)

  if (prov === 'jitsi') {
    const slug = args.workspacePublicSlug?.trim()
    if (!slug) return null
    return jitsiUrlForPublicWorkspaceSlug(slug)
  }

  if (prov === 'google_meet' || prov === 'custom') {
    return normalizedMeetingLink(args.meetingLink ?? null)
  }

  return null
}

/**
 * وجهة مؤشر الحصة في الرأس (أستاذ/طالب): Meet/Jitsi حسب اختيار الأستاذ، أو الصفحة العامة.
 */
export function resolveOnlineJoinForLiveHeader(args: {
  liveSlug: string
  indicatorKind: 'green' | 'orange' | 'red'
  meetingProvider: string | null | undefined
  onlineJoinEnabled: boolean | null | undefined
  meetingLink: string | null | undefined
}): { href: string; external: boolean } {
  const internal = liveSessionPublicPagePath(args.liveSlug)

  if (args.indicatorKind === 'red') {
    return { href: internal, external: false }
  }

  if (args.onlineJoinEnabled === false) {
    return { href: internal, external: false }
  }

  const prov = normalizeMeetingProvider(args.meetingProvider)

  if (prov === 'jitsi') {
    const jitsi = jitsiUrlForPublicWorkspaceSlug(args.liveSlug)
    if (jitsi) return { href: jitsi, external: true }
    return { href: internal, external: false }
  }

  const link = normalizedMeetingLink(args.meetingLink)
  if (link) return { href: link, external: true }

  return { href: internal, external: false }
}
