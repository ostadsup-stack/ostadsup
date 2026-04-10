export function Loading({ label = 'جاري التحميل…' }: { label?: string }) {
  return (
    <div className="loading">
      <div className="loading__spinner" aria-hidden />
      <span>{label}</span>
    </div>
  )
}
