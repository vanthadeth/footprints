import { useState } from 'react'
import { CalendarRange } from 'lucide-react'
import { BottomSheet } from '@/components/BottomSheet'
import { getCustomRange, getPresetRange, todayDateString, type DateRange } from '@/lib/dateRange'

const PRESETS = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'this_week', label: 'This Week' },
  { key: 'this_month', label: 'This Month' },
] as const

/** Horizontal period chips for Team Reports/Logs: four presets plus a custom date range (opens a small from/to sheet). */
export function PeriodChips({ value, onChange }: { value: DateRange; onChange: (range: DateRange) => void }) {
  const [open, setOpen] = useState(false)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const isPreset = PRESETS.some((p) => p.label === value.label)
  const today = todayDateString()

  return (
    <>
      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-0.5 md:mx-0 md:px-0">
        {PRESETS.map((p) => {
          const active = value.label === p.label
          return (
            <button
              key={p.key}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(getPresetRange(p.key))}
              className={`h-9 shrink-0 rounded-full border-[1.5px] px-3.5 text-xs font-bold ${
                active ? 'border-brand-500 bg-brand-500 text-white' : 'border-neutral-200 bg-white text-neutral-600'
              }`}
            >
              {p.label}
            </button>
          )
        })}
        <button
          type="button"
          aria-pressed={!isPreset}
          onClick={() => setOpen(true)}
          className={`flex h-9 shrink-0 items-center gap-1.5 rounded-full border-[1.5px] px-3.5 text-xs font-bold ${
            !isPreset ? 'border-brand-500 bg-brand-500 text-white' : 'border-neutral-200 bg-white text-neutral-600'
          }`}
        >
          <CalendarRange className="h-3.5 w-3.5" aria-hidden />
          {isPreset ? 'Date range' : value.label}
        </button>
      </div>

      <BottomSheet open={open} onClose={() => setOpen(false)} title="Date range">
        <div className="space-y-3 p-4">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs font-semibold text-neutral-500">
              From
              <input type="date" max={today} value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-900" />
            </label>
            <label className="text-xs font-semibold text-neutral-500">
              To
              <input type="date" max={today} min={from || undefined} value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-900" />
            </label>
          </div>
          <button
            disabled={!from || !to || to < from}
            onClick={() => {
              onChange(getCustomRange(from, to))
              setOpen(false)
            }}
            className="w-full rounded-xl bg-brand-500 py-3 text-sm font-semibold text-white tap-target disabled:opacity-40"
          >
            Apply
          </button>
        </div>
      </BottomSheet>
    </>
  )
}
