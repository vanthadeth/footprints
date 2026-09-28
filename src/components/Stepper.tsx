import { Minus, Plus } from 'lucide-react'

/** − value + control for small numbers (minutes, days). Clamps to [min, max]. */
export function Stepper({
  value,
  onChange,
  step = 1,
  min = 0,
  max = 999,
  format = (v) => String(v),
  label,
  disabled,
}: {
  value: number
  onChange: (value: number) => void
  step?: number
  min?: number
  max?: number
  format?: (value: number) => string
  /** What's being changed, for the buttons' accessible names ("Early clock-in"). */
  label: string
  disabled?: boolean
}) {
  const set = (v: number) => onChange(Math.min(max, Math.max(min, Math.round(v / step) * step)))
  return (
    <div className="flex shrink-0 items-center overflow-hidden rounded-lg border-[1.5px] border-neutral-200">
      <button
        type="button"
        onClick={() => set(value - step)}
        disabled={disabled || value <= min}
        aria-label={`Less ${label.toLowerCase()}`}
        className="flex h-10 w-10 items-center justify-center text-neutral-600 disabled:opacity-30"
      >
        <Minus className="h-4 w-4" />
      </button>
      <span className="min-w-[56px] text-center text-sm font-extrabold tabular-nums text-neutral-900" aria-live="polite">
        {format(value)}
      </span>
      <button
        type="button"
        onClick={() => set(value + step)}
        disabled={disabled || value >= max}
        aria-label={`More ${label.toLowerCase()}`}
        className="flex h-10 w-10 items-center justify-center text-brand-600 disabled:opacity-30"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  )
}
