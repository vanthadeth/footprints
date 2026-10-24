import { useState } from 'react'
import { Check } from 'lucide-react'
import { CalendarNav } from './Calendar'
import {
  addDays,
  addMonths,
  buildMonth,
  buildWeek,
  longDate,
  monthLabel,
  startOfWeek,
  toKey,
  weekdayNames,
  weekLabel,
  type DateKey,
  type DayCell,
  type WeekStart,
} from './calendar'
import { dayMark, summarize, LEAVE_NAMES, type AttendanceRecord, type DayMark, type MarkContext } from './attendance'

interface Props {
  /** Results by date; dates without one show nothing. */
  records: Record<DateKey, AttendanceRecord>
  holidays?: DateKey[]
  /** Selected date. */
  value?: DateKey
  onSelect?: (date: DateKey) => void
  defaultView?: 'month' | 'week'
  /** Month and Week switch above the calendar. */
  showViewSwitch?: boolean
  weekStart?: WeekStart
  /** Defaults to the real today. */
  today?: DateKey
  /** Present, late or early, leave and absent counts under the calendar. */
  showSummary?: boolean
  className?: string
}

function Mark({ mark }: { mark: DayMark }) {
  return (
    <span className="att-st">
      {mark.kind === 'present' ? <Check size={16} strokeWidth={3} aria-hidden="true" /> : mark.text}
      {mark.half && <span className="att-half">½</span>}
    </span>
  )
}

function cellClass(c: DayCell, mark: DayMark, tall: boolean): string {
  const bg = mark.kind === 'late' || mark.kind === 'leave' || mark.kind === 'absent' || mark.kind === 'holiday' ? `cal-bg-${mark.kind}` : ''
  return ['cal-day att', tall && 'cal-tall att-tall', !c.inMonth && 'cal-o', c.weekend && 'cal-we', c.selected ? 'cal-s' : c.today ? 'cal-t' : '', bg, `att-${mark.kind}`].filter(Boolean).join(' ')
}

/**
 * One person's attendance as a calendar: a green check for a present day,
 * AL / UL / SL on grey for leave, A on red for absent, and the total
 * minutes on amber for a late or early day. Holidays are striped, weekends
 * muted, future days empty. Built on the base calendar's grid and chrome.
 */
export function AttendanceCalendar({ records, holidays, value, onSelect, defaultView = 'month', showViewSwitch = false, weekStart = 'mon', today: todayProp, showSummary = true, className = '' }: Props) {
  const today = todayProp ?? toKey(new Date())
  const [view, setView] = useState<'month' | 'week'>(defaultView)
  const [cursor, setCursor] = useState<DateKey>(value ?? today)
  const ctx: MarkContext = { today, holidays }
  const opts = { today, selected: value }
  const cells = view === 'month' ? buildMonth(cursor, weekStart, opts) : buildWeek(cursor, weekStart, opts)
  const marks = cells.map((c) => (c.inMonth ? dayMark(c.key, ctx, records[c.key]) : { kind: 'none', text: '', half: false, label: '' } as DayMark))
  const counted = cells.filter((c) => c.inMonth).map((c) => c.key)
  const sum = summarize(counted, records, ctx)

  return (
    <div className={className}>
      {showViewSwitch && (
        <div className="cal-switch" role="tablist" aria-label="Calendar view">
          {(['month', 'week'] as const).map((v) => (
            <button key={v} type="button" role="tab" aria-selected={view === v} className={view === v ? 'cal-on' : ''} onClick={() => setView(v)}>
              {v === 'month' ? 'Month' : 'Week'}
            </button>
          ))}
        </div>
      )}
      <section className="cal-card" aria-label={`Attendance ${view} calendar`}>
        {view === 'month' ? (
          <>
            <CalendarNav label={monthLabel(cursor)} unit="month" onPrev={() => setCursor(addMonths(cursor, -1))} onNext={() => setCursor(addMonths(cursor, 1))} onToday={() => setCursor(today)} />
            <div className="cal-grid cal-wd">
              {weekdayNames(weekStart).map((w) => (
                <span key={w} className={w === 'SAT' || w === 'SUN' ? 'cal-we' : ''}>{w.slice(0, 3)}</span>
              ))}
            </div>
          </>
        ) : (
          <CalendarNav label={weekLabel(startOfWeek(cursor, weekStart))} unit="week" onPrev={() => setCursor(addDays(cursor, -7))} onNext={() => setCursor(addDays(cursor, 7))} />
        )}
        <div className="cal-grid cal-lines">
          {cells.map((c, i) => (
            <button
              key={c.key}
              type="button"
              className={cellClass(c, marks[i], view === 'week')}
              aria-label={`${longDate(c.key)}${marks[i].label ? `: ${marks[i].label}` : ''}`}
              aria-pressed={c.selected}
              aria-current={c.today ? 'date' : undefined}
              onClick={() => onSelect?.(c.key)}
            >
              {view === 'week' && <span className="cal-wl">{c.weekday}</span>}
              <span className="cal-dn">{c.day}</span>
              <Mark mark={marks[i]} />
            </button>
          ))}
        </div>
      </section>
      {showSummary && (
        <div className="att-sum" aria-label={view === 'month' ? 'Month totals' : 'Week totals'}>
          <div className="att-sum-p"><b>{sum.present}</b><small>Present</small></div>
          <div className="att-sum-l"><b>{sum.late}</b><small>Late / early</small><span>{sum.lateMinutes} min total</span></div>
          <div className="att-sum-v"><b>{sum.leave}</b><small>Leave</small></div>
          <div className="att-sum-a"><b>{sum.absent}</b><small>Absent</small></div>
        </div>
      )}
    </div>
  )
}

/** What each mark means, for under a calendar. */
export function AttendanceKey({ className = '' }: { className?: string }) {
  const sw = (cls: string, text: ReactLike, name: string) => (
    <span className="att-key-i">
      <i className={`att-sw ${cls}`}>{text}</i>
      {name}
    </span>
  )
  return (
    <div className={`att-key ${className}`}>
      {sw('att-present', <Check size={13} strokeWidth={3.2} aria-hidden="true" />, 'Present')}
      {sw('cal-bg-late att-late', '18m', 'Late or early, total minutes')}
      {(Object.keys(LEAVE_NAMES) as (keyof typeof LEAVE_NAMES)[]).map((code) => sw('cal-bg-leave att-leave', code, LEAVE_NAMES[code]))}
      {sw('cal-bg-absent att-absent', 'A', 'Absent')}
      {sw('cal-bg-holiday', '', 'Holiday')}
    </div>
  )
}

type ReactLike = string | JSX.Element
