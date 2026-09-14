import { useState } from 'react'
import { Calendar } from 'lucide-react'
import { BottomSheet } from '@/components/BottomSheet'
import { lastNDaysEnding, todayDateString } from '@/lib/dateRange'

/**
 * The Footprints "pick a day" control: a 7-day strip ending at whichever
 * date is selected (so picking a date outside the visible window just
 * slides the whole strip to end there), plus a calendar button for
 * jumping further back. Sits on the dark hero card, so its own tones are
 * light-on-dark rather than the app's usual white-card style.
 */
export function DayPickerBar({ selected, onChange }: { selected: string; onChange: (date: string) => void }) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pendingDate, setPendingDate] = useState(selected)
  const today = todayDateString()
  const days = lastNDaysEnding(selected, 7)

  return (
    <div className="flex items-center gap-2">
      <div className="-mx-1 flex flex-1 gap-1.5 overflow-x-auto px-1">
        {days.map((date) => {
          const d = new Date(date + 'T00:00:00')
          const isSelected = date === selected
          return (
            <button
              key={date}
              onClick={() => onChange(date)}
              className={`flex min-w-[2.75rem] shrink-0 flex-col items-center gap-0.5 rounded-xl2 px-2 py-2 tap-target ${
                isSelected ? 'bg-white text-brand-900' : 'bg-white/10 text-white/70'
              }`}
            >
              <span className="text-[10px] font-medium uppercase tracking-wide">{d.toLocaleDateString(undefined, { weekday: 'short' })}</span>
              <span className="text-sm font-semibold">{d.getDate()}</span>
            </button>
          )
        })}
      </div>

      <button
        onClick={() => {
          setPendingDate(selected)
          setPickerOpen(true)
        }}
        aria-label="Choose a date"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/10 text-white tap-target"
      >
        <Calendar className="h-4.5 w-4.5" />
      </button>

      <BottomSheet open={pickerOpen} onClose={() => setPickerOpen(false)} title="Choose a Date">
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
              setPickerOpen(false)
            }}
            className="mt-3 w-full rounded-xl bg-brand-500 py-3 text-sm font-semibold text-white tap-target disabled:opacity-40"
          >
            Go
          </button>
        </div>
      </BottomSheet>
    </div>
  )
}
