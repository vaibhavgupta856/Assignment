import type { ReactNode } from 'react'

export function Card({
  title,
  subtitle,
  children,
  className = '',
  actions,
}: {
  title?: string
  subtitle?: ReactNode
  children: ReactNode
  className?: string
  actions?: ReactNode
}) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="card-head">
          <div>
            {title && <h3>{title}</h3>}
            {subtitle && <p className="card-sub">{subtitle}</p>}
          </div>
          {actions}
        </header>
      )}
      {children}
    </section>
  )
}

export function Kpi({
  label,
  value,
  detail,
  tone = 'default',
}: {
  label: string
  value: ReactNode
  detail?: ReactNode
  tone?: 'default' | 'good' | 'warn' | 'accent'
}) {
  return (
    <div className={`kpi kpi-${tone}`}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {detail && <div className="kpi-detail">{detail}</div>}
    </div>
  )
}

export function Status({ loading, error }: { loading: boolean; error: string | null }) {
  if (error) return <div className="status status-error">Could not load data: {error}</div>
  if (loading) return <div className="status">Loading…</div>
  return null
}

export function Legend({ items }: { items: { label: string; color: string; dashed?: boolean; area?: boolean }[] }) {
  return (
    <div className="legend">
      {items.map((i) => (
        <span key={i.label} className="legend-item">
          <span
            className={`legend-swatch ${i.area ? 'legend-area' : ''} ${i.dashed ? 'legend-dashed' : ''}`}
            style={{ borderColor: i.color, background: i.area ? i.color : undefined }}
          />
          {i.label}
        </span>
      ))}
    </div>
  )
}
