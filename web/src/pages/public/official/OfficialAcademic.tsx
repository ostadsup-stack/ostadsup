import type { AcademicProfile } from '../../../types'

type Props = { academic: AcademicProfile }

export function OfficialAcademic({ academic }: Props) {
  const hasAnything =
    (academic.degrees && academic.degrees.length > 0) ||
    (academic.training && academic.training.length > 0) ||
    (academic.teachingExperience && academic.teachingExperience.length > 0) ||
    (academic.researchInterests && academic.researchInterests.length > 0) ||
    (academic.languages && academic.languages.length > 0)

  if (!hasAnything) return null

  return (
    <section className="official-card official-section" aria-labelledby="official-academic-h">
      <h2 id="official-academic-h" className="official-section__title">
        المسار الأكاديمي
      </h2>
      {academic.degrees && academic.degrees.length > 0 ? (
        <div className="official-subsection">
          <h3 className="official-subsection__title">الشهادات والتكوين</h3>
          <ul className="official-list official-list--tight">
            {academic.degrees.map((d, i) => (
              <li key={i}>
                <strong>{d.title}</strong>
                {d.institution ? <span className="muted"> — {d.institution}</span> : null}
                {d.year ? <span className="muted"> ({d.year})</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {academic.training && academic.training.length > 0 ? (
        <div className="official-subsection">
          <h3 className="official-subsection__title">التكوين المكمل</h3>
          <ul className="official-list">
            {academic.training.map((b, i) => (
              <li key={i}>
                <strong>{b.label}</strong>
                <p className="official-subsection__body">{b.body}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {academic.teachingExperience && academic.teachingExperience.length > 0 ? (
        <div className="official-subsection">
          <h3 className="official-subsection__title">الخبرة البيداغوجية</h3>
          <ul className="official-list">
            {academic.teachingExperience.map((b, i) => (
              <li key={i}>
                <strong>{b.label}</strong>
                <p className="official-subsection__body">{b.body}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {academic.researchInterests && academic.researchInterests.length > 0 ? (
        <div className="official-subsection">
          <h3 className="official-subsection__title">الاهتمامات البحثية</h3>
          <ul className="official-list official-list--inline">
            {academic.researchInterests.map((t, i) => (
              <li key={i} className="official-pill">
                {t}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {academic.languages && academic.languages.length > 0 ? (
        <div className="official-subsection">
          <h3 className="official-subsection__title">اللغات</h3>
          <p className="official-subsection__body">{academic.languages.join('، ')}</p>
        </div>
      ) : null}
    </section>
  )
}
