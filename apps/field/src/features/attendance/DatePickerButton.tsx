import { useState } from 'react'
import { Calendar } from 'lucide-react'
import { BottomSheet } from '@/components/BottomSheet'
import { MonthCalendar } from '@/components/MonthCalendar'
import { todayDateString } from '@/lib/dateRange'

/** The "jump to any earlier date" action for Footprints -- a calendar icon button (top-right of the section) that opens a month-grid calendar to pick a date. Separate from DayPickerBar so it can sit in the section header rather than inline with the day strip. */
export function DatePickerButton({ selected, onChange }: { selected: string; onChange: (date: string) => void }) {
  const [open, setOpen] = useState(false)
  const today = todayDateString()

  function handleSelect(date: string) {
    onChange(date)
    setOpen(false)
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Choose a date"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-600 tap-target"
      >
        <Calendar className="h-4 w-4" />
      </button>

      <BottomSheet open={open} onClose={() => setOpen(false)} title="Choose a Date">
        <div className="p-4">
          <MonthCalendar value={selected} max={today} onSelect={handleSelect} />
        </div>
      </BottomSheet>
    </>
  )
}
