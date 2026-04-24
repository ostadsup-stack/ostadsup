/**
 * بنية workspaces.public_site_settings (JSONB):
 * - page_header_title: نص اختياري للشريط العلوي للصفحة العامة
 * - section_order: مصفوفة معرفات أقسام (انظر PUBLIC_SECTION_IDS)
 * - sections_visible: { hero, academic, posts, library, schedule, cohorts, contact, footer }
 * - contact_visible: { phone, whatsapp, email, social, office_hours }
 */
import type { PublicSiteSettings } from '../types'

export const PUBLIC_SECTION_IDS = [
  'hero',
  'academic',
  'posts',
  'library',
  'schedule',
  'cohorts',
  'contact',
  'footer',
] as const

export type PublicSectionId = (typeof PUBLIC_SECTION_IDS)[number]

export function isPublicSectionId(s: string): s is PublicSectionId {
  return (PUBLIC_SECTION_IDS as readonly string[]).includes(s)
}

const DEFAULT_SECTION_ORDER: PublicSectionId[] = [...PUBLIC_SECTION_IDS]

const DEFAULT_SECTIONS_VISIBLE: Record<PublicSectionId, boolean> = {
  hero: true,
  academic: true,
  posts: true,
  library: true,
  schedule: false,
  cohorts: false,
  contact: true,
  footer: true,
}

type ContactVisibleKey = 'phone' | 'whatsapp' | 'email' | 'social' | 'office_hours'

const DEFAULT_CONTACT_VISIBLE: Record<ContactVisibleKey, boolean> = {
  phone: true,
  whatsapp: true,
  email: true,
  social: true,
  office_hours: true,
}

/** يدمج إعدادات قاعدة البيانات مع القيم الافتراضية الآمنة. */
export function mergePublicSiteSettings(raw: unknown): {
  pageHeaderTitle: string
  sectionOrder: PublicSectionId[]
  sectionsVisible: Record<PublicSectionId, boolean>
  contactVisible: Record<ContactVisibleKey, boolean>
} {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as PublicSiteSettings) : {}

  const rawTitle = typeof o.page_header_title === 'string' ? o.page_header_title.trim() : ''
  const pageHeaderTitle = rawTitle.length > 200 ? rawTitle.slice(0, 200) : rawTitle

  const orderRaw = Array.isArray(o.section_order) ? o.section_order : []
  const sectionOrder: PublicSectionId[] = []
  for (const id of orderRaw) {
    if (typeof id === 'string' && isPublicSectionId(id) && !sectionOrder.includes(id)) {
      sectionOrder.push(id)
    }
  }
  for (const id of DEFAULT_SECTION_ORDER) {
    if (!sectionOrder.includes(id)) sectionOrder.push(id)
  }

  const vis = o.sections_visible && typeof o.sections_visible === 'object' ? o.sections_visible : {}
  const sectionsVisible = { ...DEFAULT_SECTIONS_VISIBLE }
  for (const id of PUBLIC_SECTION_IDS) {
    const v = vis[id]
    if (typeof v === 'boolean') sectionsVisible[id] = v
  }

  const cv = (o.contact_visible && typeof o.contact_visible === 'object' ? o.contact_visible : {}) as Partial<
    Record<ContactVisibleKey, boolean>
  >
  const contactVisible: Record<ContactVisibleKey, boolean> = { ...DEFAULT_CONTACT_VISIBLE }
  for (const k of Object.keys(DEFAULT_CONTACT_VISIBLE) as ContactVisibleKey[]) {
    const v = cv[k]
    if (typeof v === 'boolean') contactVisible[k] = v
  }

  return { pageHeaderTitle, sectionOrder, sectionsVisible, contactVisible }
}
