import { lastNDaysEnding, todayDateString } from '@/lib/dateRange'

const VISIBLE_DAYS = 5

/**
 * The Footprints "pick a day" strip: always today plus the previous
 * VISIBLE_DAYS - 1 days, laid out as an even-width grid so it always fits
 * the container instead of scrolling. This window is pinned to today and
 * never shifts based on the current selection -- picking an older date via
 * the calendar (DatePickerButton, in the section header) just shows that
 * day's data with none of these buttons highlighted, rather than sliding
 * the whole strip to end there. Today's cell always reads "Today" instead
 * of its weekday abbreviation, so it stays identifiable even once it's no
 * longer the selected one.
 */
export function DayPickerBar({ selected, onChange }: { selected: string; onChange: (date: string) => void }) {
  const today = todayDateString()
  const days = lastNDaysEnding(today, VISIBLE_DAYS)

  return (
    <div className="grid grid-cols-5 gap-1.5">
      {days.map((date) => {
        const d = new Date(date + 'T00:00:00')
        const isSelected = date === selected
        const isToday = date === today
        return (
          <button
            key={date}
            onClick={() => onChange(date)}
            className={`flex flex-col items-center gap-0.5 rounded-xl2 border px-1 py-2 tap-target ${
              isSelected ? 'border-brand-500 bg-brand-500 text-white' : 'border-neutral-200 bg-white text-neutral-500'
            }`}
          >
            <span className="text-[10px] font-medium uppercase tracking-wide">
              {isToday ? 'Today' : d.toLocaleDateString(undefined, { weekday: 'short' })}
            </span>
            <span className="text-sm font-semibold">{d.getDate()}</span>
          </button>
        )
      })}
    </div>
  )
}
