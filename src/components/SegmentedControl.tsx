import type { ReactNode } from 'react'
import { haptic } from '@/lib/haptic'

export interface SegmentOption<T extends string> {
  value: T
  label: ReactNode
  /** Optional trailing count, e.g. "Active 9". */
  count?: number
}

interface Props<T extends string> {
  options: SegmentOption<T>[]
  value: T
  onChange: (value: T) => void
  ariaLabel: string
  /** `pill` = the rounded-full switch used for view/period toggles; `tabs` = a squarer variant for in-card choices. */
  shape?: 'pill' | 'tabs'
  className?: string
}

/**
 * The one segmented switch for the app (period pickers, view switchers,
 * filters) -- previously copy-pasted as ad hoc markup in LeavePage,
 * FleetPage, ReportsTab and AppearanceControl.
 */
export function SegmentedControl<T extends string>({ options, value, onChange, ariaLabel, shape = 'pill', className = '' }: Props<T>) {
  const outer = shape === 'pill' ? 'rounded-full' : 'rounded-xl'
  const inner = shape === 'pill' ? 'rounded-full' : 'rounded-lg'
  return (
    <div role="group" aria-label={ariaLabel} className={`flex gap-1 bg-neutral-100 p-1 ${outer} ${className}`}>
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={active}
            onClick={() => {
              if (active) return
              haptic('light')
              onChange(opt.value)
            }}
            className={`flex min-h-[36px] flex-1 items-center justify-center gap-1.5 px-3 text-sm font-semibold ${inner} ${
              active ? 'bg-white text-neutral-900 shadow-sm dark:bg-neutral-700' : 'text-neutral-500'
            }`}
          >
            {opt.label}
            {opt.count !== undefined && <span className="text-xs font-bold opacity-70">{opt.count}</span>}
          </button>
        )
      })}
    </div>
  )
}
