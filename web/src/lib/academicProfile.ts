/**
 * profiles.academic_profile (JSONB) — الحقول الاختيارية:
 * rankTitle, institution, degrees[{title, institution?, year?}],
 * training[{label, body}], teachingExperience[{label, body}],
 * researchInterests[string[]], languages[string[]]
 */
import type { AcademicProfile } from '../types'

export function parseAcademicProfile(raw: unknown): AcademicProfile {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const o = raw as Record<string, unknown>
  const out: AcademicProfile = {}
  if (typeof o.rankTitle === 'string') out.rankTitle = o.rankTitle
  if (typeof o.institution === 'string') out.institution = o.institution
  if (Array.isArray(o.degrees)) {
    out.degrees = o.degrees
      .filter((d): d is Record<string, unknown> => d != null && typeof d === 'object' && !Array.isArray(d))
      .map((d) => ({
        title: typeof d.title === 'string' ? d.title : '',
        institution: typeof d.institution === 'string' ? d.institution : null,
        year: typeof d.year === 'string' ? d.year : null,
      }))
      .filter((d) => d.title.trim())
  }
  const blocks = (key: 'training' | 'teachingExperience') => {
    const arr = o[key]
    if (!Array.isArray(arr)) return undefined
    return arr
      .filter((x): x is Record<string, unknown> => x != null && typeof x === 'object' && !Array.isArray(x))
      .map((x) => ({
        label: typeof x.label === 'string' ? x.label : '',
        body: typeof x.body === 'string' ? x.body : '',
      }))
      .filter((x) => x.label.trim() && x.body.trim())
  }
  const tr = blocks('training')
  if (tr?.length) out.training = tr
  const te = blocks('teachingExperience')
  if (te?.length) out.teachingExperience = te
  if (Array.isArray(o.researchInterests)) {
    out.researchInterests = o.researchInterests.filter((x): x is string => typeof x === 'string' && Boolean(x.trim()))
  }
  if (Array.isArray(o.languages)) {
    out.languages = o.languages.filter((x): x is string => typeof x === 'string' && Boolean(x.trim()))
  }
  return out
}

export function emptyAcademicProfile(): AcademicProfile {
  return {
    rankTitle: '',
    institution: '',
    degrees: [],
    training: [],
    teachingExperience: [],
    researchInterests: [],
    languages: [],
  }
}

/** يحوّل نموذج الواجهة إلى JSON يُخزَّن في profiles.academic_profile */
export function serializeAcademicProfile(a: AcademicProfile): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (a.rankTitle?.trim()) out.rankTitle = a.rankTitle.trim()
  if (a.institution?.trim()) out.institution = a.institution.trim()
  if (a.degrees?.length) {
    out.degrees = a.degrees
      .filter((d) => d.title.trim())
      .map((d) => ({
        title: d.title.trim(),
        institution: d.institution?.trim() || null,
        year: d.year?.trim() || null,
      }))
  }
  if (a.training?.length) {
    out.training = a.training.filter((b) => b.label.trim() && b.body.trim())
  }
  if (a.teachingExperience?.length) {
    out.teachingExperience = a.teachingExperience.filter((b) => b.label.trim() && b.body.trim())
  }
  if (a.researchInterests?.length) {
    out.researchInterests = a.researchInterests.map((x) => x.trim()).filter(Boolean)
  }
  if (a.languages?.length) {
    out.languages = a.languages.map((x) => x.trim()).filter(Boolean)
  }
  return out
}
