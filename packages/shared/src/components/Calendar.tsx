import { useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import {
  addDays,
  addMonths,
  buildAgenda,
  buildMonth,
  buildWeek,
  longDate,
  monthLabel,
  startOfWeek,
  toKey,
  weekdayNames,
  weekLabel,
  type CalendarView,
  type DateKey,
  type DayCell,
  type DayMarks,
  type DisabledRange,
  type WeekStart,
} from './calendar'

interface Props {
  /** The selected date. */
  value?: DateKey
  onSelect?: (date: DateKey) => void
  /** Month, week or agenda; `showViewSwitch` adds the switcher above. */
  defaultView?: CalendarView
  showViewSwitch?: boolean
  /** Monday by default. */
  weekStart?: WeekStart
  disabled?: DisabledRange[]
  /** Marks per date: attendance background, holiday stripes, appointment and visit dots. */
  marks?: Record<DateKey, DayMarks>
  /** Defaults to the real today. */
  today?: DateKey
  /** Days listed in the agenda from the viewed date. */
  agendaDays?: number
  /** What the agenda shows for a date; "Nothing planned" when it returns nothing. */
  renderAgendaEntries?: (date: DateKey) => ReactNode
  className?: string
}

const VIEWS: { key: CalendarView; label: string }[] = [
  { key: 'month', label: 'Month' },
  { key: 'week', label: 'Week' },
  { key: 'agenda', label: 'Agenda' },
]

function cellClass(c: DayCell, extra = ''): string {
  const state = c.selected ? 'cal-s' : c.today ? 'cal-t' : ''
  return ['cal-day', extra, !c.inMonth && 'cal-o', c.weekend && 'cal-we', c.disabled && 'cal-dis', state, c.background && `cal-bg-${c.background}`].filter(Boolean).join(' ')
}

function Dots({ cell }: { cell: DayCell }) {
  return (
    <span className="cal-slot">
      {cell.dots.map((d) => (
        <i key={d} className={`cal-dot cal-dot-${d}`} />
      ))}
    </span>
  )
}

function Nav({ label, onPrev, onNext, unit, onToday }: { label: string; onPrev: () => void; onNext: () => void; unit: string; onToday?: () => void }) {
  return (
    <div className="cal-head">
      <span className="cal-title">{label}</span>
      {onToday && (
        <button type="button" className="cal-today" onClick={onToday}>
          Today
        </button>
      )}
      <button type="button" className="cal-nav" aria-label={`Previous ${unit}`} onClick={onPrev}>
        <ChevronLeft size={20} strokeWidth={2.4} />
      </button>
      <button type="button" className="cal-nav" aria-label={`Next ${unit}`} onClick={onNext}>
        <ChevronRight size={20} strokeWidth={2.4} />
      </button>
    </div>
  )
}

/**
 * The base calendar: a month grid (six weeks, 46px cells), a week strip
 * (72px cells) and an agenda list, with the day states (weekend, other
 * month, disabled, today, selected) and the indicators (holiday stripes,
 * attendance background, appointment and visit dots). Colours come from
 * the --cal-* variables in styles.css (light and dark).
 */
export function Calendar({
  value,
  onSelect,
  defaultView = 'month',
  showViewSwitch = false,
  weekStart = 'mon',
  disabled,
  marks,
  today: todayProp,
  agendaDays = 5,
  renderAgendaEntries,
  className = '',
}: Props) {
  const today = todayProp ?? toKey(new Date())
  const [view, setView] = useState<CalendarView>(defaultView)
  const [cursor, setCursor] = useState<DateKey>(value ?? today)
  const opts = { today, selected: value, disabled, marks }
  const pick = (c: DayCell) => {
    if (!c.disabled) onSelect?.(c.key)
  }

  return (
    <div className={className}>
      {showViewSwitch && (
        <div className="cal-switch" role="tablist" aria-label="Calendar view">
          {VIEWS.map((v) => (
            <button key={v.key} type="button" role="tab" aria-selected={view === v.key} className={view === v.key ? 'cal-on' : ''} onClick={() => setView(v.key)}>
              {v.label}
            </button>
          ))}
        </div>
      )}
      <section className="cal-card" aria-label={`${view[0].toUpperCase()}${view.slice(1)} calendar`}>
        {view === 'month' && (
          <>
            <Nav label={monthLabel(cursor)} unit="month" onPrev={() => setCursor(addMonths(cursor, -1))} onNext={() => setCursor(addMonths(cursor, 1))} onToday={() => setCursor(today)} />
            <div className="cal-grid cal-wd">
              {weekdayNames(weekStart).map((w) => (
                <span key={w} className={w === 'SAT' || w === 'SUN' ? 'cal-we' : ''}>{w.slice(0, 3)}</span>
              ))}
            </div>
            <div className="cal-grid cal-lines">
              {buildMonth(cursor, weekStart, opts).map((c) => (
                <button key={c.key} type="button" className={cellClass(c)} disabled={c.disabled} aria-label={longDate(c.key)} aria-pressed={c.selected} aria-current={c.today ? 'date' : undefined} onClick={() => pick(c)}>
                  <span className="cal-dn">{c.day}</span>
                  <Dots cell={c} />
                </button>
              ))}
            </div>
          </>
        )}
        {view === 'week' && (
          <>
            <Nav label={weekLabel(startOfWeek(cursor, weekStart))} unit="week" onPrev={() => setCursor(addDays(cursor, -7))} onNext={() => setCursor(addDays(cursor, 7))} />
            <div className="cal-grid cal-lines">
              {buildWeek(cursor, weekStart, opts).map((c) => (
                <button key={c.key} type="button" className={cellClass(c, 'cal-tall')} disabled={c.disabled} aria-label={longDate(c.key)} aria-pressed={c.selected} aria-current={c.today ? 'date' : undefined} onClick={() => pick(c)}>
                  <span className="cal-wl">{c.weekday}</span>
                  <span className="cal-dn">{c.day}</span>
                  <Dots cell={c} />
                </button>
              ))}
            </div>
          </>
        )}
        {view === 'agenda' &&
          buildAgenda(cursor, agendaDays, opts).map((c) => (
            <div key={c.key} className={`cal-ag${c.today ? ' cal-ag-t' : ''}`}>
              <span className="cal-ad">
                <b>{c.day}</b>
                <small>{c.weekday}</small>
              </span>
              <span className="cal-ae">{renderAgendaEntries?.(c.key) ?? 'Nothing planned'}</span>
            </div>
          ))}
      </section>
    </div>
  )
}
