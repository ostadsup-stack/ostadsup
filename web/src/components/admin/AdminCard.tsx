import type { ReactNode, HTMLAttributes } from 'react'

type AdminCardProps = {
  children: ReactNode
  className?: string
  as?: 'section' | 'div'
} & Pick<HTMLAttributes<HTMLElement>, 'aria-labelledby' | 'id' | 'role'>

/**
 * حاوية بصرية موحّدة: حدود، ظل، زوايا، ومسافات — باستخدام ألوان `index.css` (فاتح/داكن).
 */
export function AdminCard({ children, className = '', as: Tag = 'div', ...rest }: AdminCardProps) {
  return (
    <Tag className={`admin-ui-card ${className}`.trim()} {...rest}>
      {children}
    </Tag>
  )
}

type AdminCardHeaderProps = {
  title: string
  description?: string
  /** لربط العنوان بـ aria-labelledby على الحاوية */
  id?: string
}

export function AdminCardHeader({ title, description, id }: AdminCardHeaderProps) {
  return (
    <header className="admin-ui-card__header">
      <h2 className="admin-ui-card__title" id={id}>
        {title}
      </h2>
      {description ? <p className="admin-ui-card__desc muted">{description}</p> : null}
    </header>
  )
}
