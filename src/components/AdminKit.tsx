import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, Plus, type LucideIcon } from 'lucide-react'
import { haptic } from '@/lib/haptic'

/**
 * The admin screens' shared pieces, as on the design canvas (Polish ›
 * Admin › …): a segmented tab bar kept in the URL (?tab=), flat groups with
 * an uppercase title, and rows of icon tile · label/sub · value or control.
 */

export function AdminTabs<T extends string>({ tabs, value, onChange }: { tabs: [T, string][]; value: T; onChange: (t: T) => void }) {
  return (
    <div role="tablist" aria-label="Sections" className="flex gap-0.5 rounded-xl bg-neutral-100 p-[3px]">
      {tabs.map(([k, label]) => {
        const on = k === value
        return (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => {
              haptic('light')
              onChange(k)
            }}
            className={`h-9 min-w-0 flex-1 whitespace-nowrap rounded-[9px] px-1 text-[13px] ${on ? 'seg-on font-bold text-neutral-900 shadow-sm' : 'font-semibold text-neutral-500'}`}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

/** One titled group of rows; `add` puts a link-coloured "+ …" button under it. */
export function AdminGroup({ title, note, add, onAdd, addDisabled, children }: { title: string; note?: string; add?: string; onAdd?: () => void; addDisabled?: boolean; children: ReactNode }) {
  return (
    <section aria-label={title}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="mb-0.5 text-xs font-bold uppercase tracking-[0.06em] text-neutral-500">{title}</h2>
        {note && <span className="text-xs text-neutral-500">{note}</span>}
      </div>
      <div className="border-b border-neutral-100 dark:border-neutral-800">{children}</div>
      {add && onAdd && (
        <button
          type="button"
          onClick={onAdd}
          disabled={addDisabled}
          className="mt-2 inline-flex items-center gap-1.5 py-1 text-sm font-bold text-brand-500 disabled:opacity-40"
        >
          <Plus className="h-[15px] w-[15px]" strokeWidth={2.4} aria-hidden />
          {add}
        </button>
      )}
    </section>
  )
}

const PILL: Record<string, string> = {
  ok: 'bg-status-working/10 text-status-working',
  warn: 'bg-status-warn/10 text-status-warn',
  danger: 'bg-status-danger/10 text-status-danger',
  brand: 'bg-brand-50 text-brand-700',
  plain: 'bg-neutral-100 text-neutral-600',
}

export interface AdminRowProps {
  icon?: LucideIcon
  avatar?: { text: string; color: string }
  label: string
  sub?: string
  value?: string
  valueTone?: 'ok' | 'warn' | 'danger'
  pill?: { text: string; tone: keyof typeof PILL }
  /** A control on the right (switch, stepper…) instead of a value. */
  control?: ReactNode
  to?: string
  onClick?: () => void
  disabled?: boolean
}

export function AdminRow({ icon: Icon, avatar, label, sub, value, valueTone, pill, control, to, onClick, disabled }: AdminRowProps) {
  const inner = (
    <>
      {Icon && (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] border-[1.5px] border-neutral-200 text-neutral-900">
          <Icon className="h-[17px] w-[17px]" aria-hidden />
        </span>
      )}
      {avatar && (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: avatar.color }}>
          {avatar.text}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 block text-[15px] font-semibold leading-5 text-neutral-900">{label}</span>
        {sub && <span className="block text-xs leading-4 text-neutral-500">{sub}</span>}
      </span>
      {value && (
        <span
          className={`max-w-[46%] shrink-0 text-right text-sm font-bold ${
            valueTone === 'ok' ? 'text-status-working' : valueTone === 'warn' ? 'text-status-warn' : valueTone === 'danger' ? 'text-status-danger' : 'text-neutral-900'
          }`}
        >
          {value}
        </span>
      )}
      {pill && <span className={`inline-flex h-[22px] shrink-0 items-center rounded-full px-2 text-[11px] font-bold ${PILL[pill.tone]}`}>{pill.text}</span>}
      {control}
      {(to || onClick) && <ChevronRight className="h-4 w-4 shrink-0 text-neutral-500" strokeWidth={2.2} aria-hidden />}
    </>
  )
  const cls = `flex min-h-[58px] w-full items-center gap-3 border-t border-neutral-100 py-1.5 text-left dark:border-neutral-800 ${disabled ? 'opacity-50' : ''}`
  if (to)
    return (
      <Link to={to} className={cls}>
        {inner}
      </Link>
    )
  if (onClick)
    return (
      <button type="button" onClick={onClick} disabled={disabled} className={cls}>
        {inner}
      </button>
    )
  return <div className={cls}>{inner}</div>
}

/** The canvas's on/off switch: green when on. */
export function AdminSwitch({ on, label, disabled, onToggle }: { on: boolean; label: string; disabled?: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => {
        haptic('light')
        onToggle()
      }}
      className={`relative h-[30px] w-[50px] shrink-0 rounded-full transition-colors disabled:opacity-50 ${on ? 'bg-status-working' : 'bg-neutral-300 dark:bg-neutral-600'}`}
    >
      <span className={`absolute top-[3px] h-6 w-6 rounded-full bg-[#ffffff] shadow transition-[left] ${on ? 'left-[23px]' : 'left-[3px]'}`} />
    </button>
  )
}

/** Page frame for an admin screen: an optional subtitle, the tabs, then the content. */
export function AdminFrame({ sub, tabs, children }: { sub?: string; tabs?: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto flex max-w-lg flex-col gap-[18px] px-4 pb-28 pt-1.5 md:max-w-2xl md:px-8">
      {sub && <p className="-mb-2 text-[13px] text-neutral-500">{sub}</p>}
      {tabs}
      {children}
    </div>
  )
}
