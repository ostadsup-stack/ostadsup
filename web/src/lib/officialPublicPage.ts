import { mergePublicSiteSettings } from './publicSiteSettings'

/** عنوان الشريط العلوي للصفحة الرسمية للأستاذ (القالب الافتراضي). */
export function officialTeacherPublicHeaderTitle(fullName: string | null | undefined): string {
  const n = fullName?.trim()
  if (n) return `الصفحة الرسمية للأستاذ (ة) «${n}»`
  return 'الصفحة الرسمية للأستاذ (ة)'
}

/** عنوان الشريط: تخصيص من public_site_settings إن وُجد، وإلا القالب مع الاسم. */
export function resolvePublicOfficialHeaderTitle(
  publicSiteSettings: unknown,
  fullName: string | null | undefined,
): string {
  const custom = mergePublicSiteSettings(publicSiteSettings).pageHeaderTitle.trim()
  if (custom) return custom
  return officialTeacherPublicHeaderTitle(fullName)
}

/** تسميات عربية لأنواع المنشورات على الصفحة الرسمية. */
export function postTypeLabelAr(postType: string | null | undefined): string {
  const t = (postType ?? 'general').toLowerCase()
  const map: Record<string, string> = {
    general: 'منشور',
    announcement: 'إعلان',
    announce: 'إعلان',
    article: 'مقال',
    book: 'كتاب',
    seminar: 'ندوة',
    news: 'خبر',
    activity: 'نشاط',
  }
  return map[t] ?? 'منشور'
}

export function excerpt(text: string, maxLen: number) {
  const t = text.replace(/\s+/g, ' ').trim()
  if (t.length <= maxLen) return t
  return `${t.slice(0, maxLen).trim()}…`
}

export function materialTypeLabelAr(materialType: string): string {
  const map: Record<string, string> = {
    book: 'كتاب',
    lesson: 'مادة علمية',
    reference: 'رابط أو مرجع',
  }
  return map[materialType] ?? materialType
}
