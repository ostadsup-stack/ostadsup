import { scheduleModeLabelAr, studyTrackLabelAr } from '../../../lib/teacherGroups'
import type { PublicGroupTeaserRow } from '../../../types'

const LEVEL_AR: Record<string, string> = {
  licence: 'إجازة',
  master: 'ماستر',
  doctorate: 'دكتوراه',
}

type Props = { groups: PublicGroupTeaserRow[] }

export function OfficialCohorts({ groups }: Props) {
  if (groups.length === 0) return null
  return (
    <section className="official-card official-section" aria-labelledby="official-cohorts-h">
      <h2 id="official-cohorts-h" className="official-section__title">
        المواد والأفواج
      </h2>
      <p className="muted small official-section__lead">معلومات عامة فقط — دون رموز الانضمام أو بيانات الطلاب.</p>
      <ul className="official-cohort-grid">
        {groups.map((g) => (
          <li key={g.id} className="official-cohort-card">
            <h3 className="official-cohort-card__title">{g.group_name}</h3>
            {g.subject_name?.trim() ? <p className="official-cohort-card__line">{g.subject_name.trim()}</p> : null}
            <p className="muted small">
              {LEVEL_AR[g.study_level] ?? g.study_level}
              {g.academic_year?.trim() ? ` — ${g.academic_year.trim()}` : ''}
              {g.schedule_mode != null || g.study_track != null
                ? ` — ${scheduleModeLabelAr(g.schedule_mode)} / ${studyTrackLabelAr(g.study_track)}`
                : null}
            </p>
            {(g.university?.trim() || g.faculty?.trim()) && (
              <p className="muted small">
                {[g.university?.trim(), g.faculty?.trim()].filter(Boolean).join(' — ')}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
