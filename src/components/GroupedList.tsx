import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, type LucideIcon } from 'lucide-react'

/** An iOS Settings-style group: small caps heading over one rounded card of rows. */
export function GroupedList({ title, children, footer }: { title?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <section className="space-y-1.5">
      {title && <h2 className="px-3.5 text-xs font-semibold uppercase tracking-wide text-neutral-500">{title}</h2>}
      <div className="divide-y divide-neutral-100 overflow-hidden rounded-xl2 bg-white shadow-card dark:divide-neutral-800">{children}</div>
      {footer && <div className="px-3.5 text-xs text-neutral-500">{footer}</div>}
    </section>
  )
}

interface RowProps {
  icon: LucideIcon
  /** Background class for the icon square, e.g. "bg-brand-500". Always paired with a white glyph. */
  iconBg: string
  label: string
  sublabel?: string
  value?: ReactNode
  /** Red count pill, hidden at 0. */
  badge?: number
  to?: string
  onClick?: () => void
  /** Replaces the chevron (e.g. a segmented control or switch). */
  trailing?: ReactNode
}

/** One row in a GroupedList -- a Link when `to` is set, a button when `onClick` is, otherwise static (for rows that host their own control). */
export function ListRow({ icon: Icon, iconBg, label, sublabel, value, badge, to, onClick, trailing }: RowProps) {
  const body = (
    <>
      <span className={`flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg text-white ${iconBg}`}>
        <Icon className="h-[17px] w-[17px]" strokeWidth={2.2} aria-hidden />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[15px] font-medium text-neutral-900">{label}</span>
        {sublabel && <span className="truncate text-xs text-neutral-500">{sublabel}</span>}
      </span>
      {value !== undefined && <span className="shrink-0 text-sm text-neutral-500">{value}</span>}
      {badge !== undefined && badge > 0 && (
        <span className="flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-status-danger px-1.5 text-xs font-bold text-white">{badge}</span>
      )}
      {trailing ?? ((to || onClick) && <ChevronRight className="h-4 w-4 shrink-0 text-neutral-400" aria-hidden />)}
    </>
  )
  const cls = 'flex min-h-[52px] w-full items-center gap-3 px-3.5 py-2 text-left'
  if (to) {
    return (
      <Link to={to} className={cls}>
        {body}
      </Link>
    )
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cls}>
        {body}
      </button>
    )
  }
  return <div className={cls}>{body}</div>
}
