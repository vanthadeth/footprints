import { useState } from 'react'
import { Calendar } from 'lucide-react'
import { BottomSheet } from './BottomSheet'
import { getCustomRange, getPresetRange, type DateRange, type DateRangePreset } from '@/lib/dateRange'

const PRESETS: { key: Exclude<DateRangePreset, 'custom'>; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'this_week', label: 'This Week' },
  { key: 'last_week', label: 'Last Week' },
  { key: 'this_month', label: 'This Month' },
  { key: 'last_month', label: 'Last Month' },
]

/** Reusable date filter (spec §41) used by Footprints and Reports alike. */
export function DateRangeFilter({ value, onChange }: { value: DateRange; onChange: (range: DateRange) => void }) {
  const [open, setOpen] = useState(false)
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-3.5 py-2 text-sm font-medium text-neutral-700 tap-target"
      >
        <Calendar className="h-4 w-4 text-neutral-400" />
        {value.label}
      </button>

      <BottomSheet open={open} onClose={() => setOpen(false)} title="Filter by date">
        <div className="grid grid-cols-2 gap-2 p-4">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => {
                onChange(getPresetRange(p.key))
                setOpen(false)
              }}
              className={`rounded-xl border px-4 py-3 text-sm font-medium tap-target ${
                value.label === p.label ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-neutral-200 text-neutral-700'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="border-t border-neutral-100 p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">Custom Period</p>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="flex-1 rounded-lg border border-neutral-300 px-3 py-2.5 text-sm"
            />
            <span className="text-neutral-400">to</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="flex-1 rounded-lg border border-neutral-300 px-3 py-2.5 text-sm"
            />
          </div>
          <button
            disabled={!customFrom || !customTo}
            onClick={() => {
              onChange(getCustomRange(customFrom, customTo))
              setOpen(false)
            }}
            className="mt-3 w-full rounded-xl bg-brand-500 py-3 text-sm font-semibold text-white tap-target disabled:opacity-40"
          >
            Apply
          </button>
        </div>
      </BottomSheet>
    </>
  )
}
