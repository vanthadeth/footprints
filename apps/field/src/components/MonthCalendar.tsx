import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function toDateString(year: number, month: number, day: number): string {
  return `${year}-${pad(month + 1)}-${pad(day)}`
}

/** Monday=0 .. Sunday=6, matching the business week used across the app (lib/dateRange.ts). */
function mondayIndex(year: number, month: number, day: number): number {
  const jsDay = new Date(year, month, day).getDay() // Sun=0..Sat=6
  return (jsDay + 6) % 7
}

/**
 * A plain month-grid date picker -- Mon-Sun weeks, one month visible at a
 * time, prev/next navigation. `max` ("YYYY-MM-DD") disables any later date
 * and blocks navigating past its month, since every caller here uses it to
 * mean "no picking a day that hasn't happened yet".
 */
export function MonthCalendar({ value, max, onSelect }: { value: string; max?: string; onSelect: (date: string) => void }) {
  const initial = value || max || toDateString(new Date().getFullYear(), new Date().getMonth(), new Date().getDate())
  const [initialYear, initialMonth] = initial.split('-').map(Number)
  const [viewYear, setViewYear] = useState(initialYear)
  const [viewMonth, setViewMonth] = useState(initialMonth - 1)

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const leadingBlanks = mondayIndex(viewYear, viewMonth, 1)
  const cells: (number | null)[] = [...Array(leadingBlanks).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]

  const viewMonthKey = `${viewYear}-${pad(viewMonth + 1)}`
  const atMaxMonth = max != null && viewMonthKey >= max.slice(0, 7)

  function shiftMonth(delta: number) {
    const d = new Date(viewYear, viewMonth + delta, 1)
    setViewYear(d.getFullYear())
    setViewMonth(d.getMonth())
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <button
          onClick={() => shiftMonth(-1)}
          aria-label="Previous month"
          className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-500 tap-target"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <p className="text-sm font-semibold text-neutral-900">
          {new Date(viewYear, viewMonth, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
        </p>
        <button
          onClick={() => shiftMonth(1)}
          disabled={atMaxMonth}
          aria-label="Next month"
          className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-500 tap-target disabled:opacity-30"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-y-1.5 text-center">
        {WEEKDAY_LABELS.map((w) => (
          <p key={w} className="text-[10px] font-medium uppercase tracking-wide text-neutral-400">
            {w}
          </p>
        ))}
        {cells.map((day, i) => {
          if (day == null) return <div key={`blank-${i}`} />
          const dateStr = toDateString(viewYear, viewMonth, day)
          const isSelected = dateStr === value
          const isDisabled = max != null && dateStr > max
          return (
            <button
              key={dateStr}
              onClick={() => onSelect(dateStr)}
              disabled={isDisabled}
              className={`mx-auto flex h-9 w-9 items-center justify-center rounded-full text-sm font-medium tap-target disabled:opacity-30 ${
                isSelected ? 'bg-brand-500 text-white' : 'text-neutral-700'
              }`}
            >
              {day}
            </button>
          )
        })}
      </div>
    </div>
  )
}
