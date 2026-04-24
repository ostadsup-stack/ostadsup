import type { PublicMaterialRow } from '../../../types'
import { OfficialMaterialCard } from './OfficialMaterialCard'

type Props = { materials: PublicMaterialRow[] }

export function OfficialLibrary({ materials }: Props) {
  if (materials.length === 0) return null
  return (
    <section className="official-card official-section" aria-labelledby="official-lib-h">
      <h2 id="official-lib-h" className="official-section__title">
        المكتبة العلمية
      </h2>
      <div className="official-lib-grid">
        {materials.map((m) => (
          <OfficialMaterialCard key={m.id} m={m} />
        ))}
      </div>
    </section>
  )
}
