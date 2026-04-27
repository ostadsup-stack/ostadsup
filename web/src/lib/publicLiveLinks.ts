/** رابط غرفة Jitsi المقترَحة لمساحة عامة (نفس القاعدة في صفحة /live). */
export function jitsiUrlForPublicWorkspaceSlug(slug: string): string | null {
  const safe = slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '')
  if (!safe) return null
  return `https://meet.jit.si/Ostadi-${safe}`
}

export function liveSessionPublicPagePath(slug: string): string {
  return `/p/${encodeURIComponent(slug)}/live`
}
