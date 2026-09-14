import { useState } from 'react'
import { Calendar } from 'lucide-react'
import { BottomSheet } from '@/components/BottomSheet'
import { todayDateString } from '@/lib/dateRange'

/** The "jump to any earlier date" action for Footprints -- a calendar icon button (top-right of the section) that opens a plain date input in a sheet. Separate from DayPickerBar so it can sit in the section header rather than inline with the day strip. */
export function DatePickerButton({ selected, onChange }: { selected: string; onChange: (date: string) => void }) {
  const [open, setOpen] = useState(false)
  const [pendingDate, setPendingDate] = useState(selected)
  const today = todayDateString()

  return (
    <>
      <button
        onClick={() => {
          setPendingDate(selected)
          setOpen(true)
        }}
        aria-label="Choose a date"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white tap-target"
      >
        <Calendar className="h-4 w-4" />
      </button>

      <BottomSheet open={open} onClose={() => setOpen(false)} title="Choose a Date">
        <div className="p-4">
          <input
            type="date"
            value={pendingDate}
            max={today}
            onChange={(e) => setPendingDate(e.target.value)}
            className="w-full rounded-xl border border-neutral-300 px-3.5 py-2.5 text-sm"
          />
          <button
            disabled={!pendingDate}
            onClick={() => {
              onChange(pendingDate)
              setOpen(false)
            }}
            className="mt-3 w-full rounded-xl bg-brand-500 py-3 text-sm font-semibold text-white tap-target disabled:opacity-40"
          >
            Go
          </button>
        </div>
      </BottomSheet>
    </>
  )
}
