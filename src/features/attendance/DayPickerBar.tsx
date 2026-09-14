import { lastNDaysEnding } from '@/lib/dateRange'

const VISIBLE_DAYS = 5

/**
 * The Footprints "pick a day" strip: exactly VISIBLE_DAYS days ending at
 * whichever date is selected (so picking a date outside the visible window
 * just slides the whole strip to end there), laid out as an even-width grid
 * so it always fits the container instead of scrolling. The "jump to any
 * earlier date" calendar action lives separately (DatePickerButton), in the
 * section header rather than inline here.
 */
export function DayPickerBar({ selected, onChange }: { selected: string; onChange: (date: string) => void }) {
  const days = lastNDaysEnding(selected, VISIBLE_DAYS)

  return (
    <div className="grid grid-cols-5 gap-1.5">
      {days.map((date) => {
        const d = new Date(date + 'T00:00:00')
        const isSelected = date === selected
        return (
          <button
            key={date}
            onClick={() => onChange(date)}
            className={`flex flex-col items-center gap-0.5 rounded-xl2 px-1 py-2 tap-target ${
              isSelected ? 'bg-white text-brand-900' : 'bg-white/10 text-white/70'
            }`}
          >
            <span className="text-[10px] font-medium uppercase tracking-wide">{d.toLocaleDateString(undefined, { weekday: 'short' })}</span>
            <span className="text-sm font-semibold">{d.getDate()}</span>
          </button>
        )
      })}
    </div>
  )
}
