export function PageHeader({
  title,
  subtitle,
}: {
  title: string
  subtitle?: string
}) {
  return (
    <header className="page-header">
      <h1 className="page-header__title">{title}</h1>
      {subtitle ? <p className="page-header__subtitle">{subtitle}</p> : null}
    </header>
  )
}
