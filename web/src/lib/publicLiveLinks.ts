/** رابط غرفة Jitsi المقترَحة لمساحة عامة (نفس القاعدة في صفحة /live). */
export function jitsiUrlForPublicWorkspaceSlug(slug: string): string | null {
  const safe = slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '')
  if (!safe) return null
  return `https://meet.jit.si/Ostadi-${safe}`
}

export function liveSessionPublicPagePath(slug: string): string {
  return `/p/${encodeURIComponent(slug)}/live`
}

/**
 * أين يوجّه مؤشر الحصة في الرأس: رابط الاجتماع من الجدول إن وُجد، وإلا Jitsi المقترَح، وإلا صفحة Ostadi العامة.
 * عند غياب `liveSlug` يُستخدم `internalFallbackHref` (مثلاً جدول الفوج).
 * للحالة «انتهت» يبقى التوجيه داخلياً حتى لا تُفتح روابط منتهية في تاب جديد.
 */
export function resolveLiveSessionHeaderTarget(args: {
  liveSlug: string | null
  meetingLink: string | null
  indicatorKind: 'green' | 'orange' | 'red'
  /** عند عدم توفر slug للمساحة العامة */
  internalFallbackHref: string
}): { href: string; external: boolean } {
  const { liveSlug, meetingLink, indicatorKind, internalFallbackHref } = args
  const slug = liveSlug?.trim() ?? ''
  const internal = slug.length > 0 ? liveSessionPublicPagePath(slug) : internalFallbackHref

  if (indicatorKind === 'red') {
    return { href: internal, external: false }
  }

  const trimmed = meetingLink?.trim() ?? ''
  if (trimmed.length > 0) {
    const href = /^https?:\/\//i.test(trimmed)
      ? trimmed
      : `https://${trimmed.replace(/^\/+/, '')}`
    return { href, external: true }
  }

  const jitsi = slug.length > 0 ? jitsiUrlForPublicWorkspaceSlug(slug) : null
  if (jitsi) return { href: jitsi, external: true }

  return { href: internal, external: false }
}
