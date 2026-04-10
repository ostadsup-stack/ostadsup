import type { ReactNode } from 'react'

export function EmptyState({
  title,
  hint,
}: {
  title: string
  hint?: ReactNode
}) {
  return (
    <div className="empty-state">
      <p className="empty-state__title">{title}</p>
      {hint ? <div className="empty-state__hint">{hint}</div> : null}
    </div>
  )
}
