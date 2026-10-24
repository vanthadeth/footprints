import { useState } from 'react'
import { Check, ChevronLeft, ChevronRight } from 'lucide-react'
import { addDays, addMonths, monthLabel, startOfWeek, weekLabel, fromKey, type DateKey } from './calendar'
import type { MarkKind } from './attendance'
import {
  buildRoster,
  dayList,
  dayTitle,
  money,
  monthDays,
  teamKpis,
  weekDays,
  type DayPerson,
  type RosterCell,
  type RosterData,
  type RosterGroup,
  type RosterMode,
  type Targets,
} from './roster'

interface Props {
  data: RosterData
  /** Month or week to start on. */
  defaultView?: 'month' | 'week'
  /** Selected date; the day list on the side follows it. Uncontrolled when omitted. */
  value?: DateKey
  onSelect?: (date: DateKey) => void
  onOpenPerson?: (personId: string) => void
  /** Visits and order amount per person per attended day, for the activity mode's tiles. */
  targets?: Targets
  /** Under the title, after the people count, for example the team name. */
  subtitle?: string
  className?: string
}

const WEEKDAY_LETTER = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const DEFAULT_TARGETS: Targets = { visits: 8, orders: 300 }

function CellContent({ cell, mode }: { cell: RosterCell; mode: RosterMode }) {
  if (cell.check) return <Check size={14} strokeWidth={3.2} aria-hidden="true" />
  if (cell.text) return <span>{cell.text}</span>
  if (mode === 'activity' && cell.dot) return <i className="ros-dot" />
  return null
}

function DayHeads({ days, today, selected }: { days: DateKey[]; today: DateKey; selected?: DateKey }) {
  return (
    <>
      {days.map((d) => {
        const dow = fromKey(d).getDay()
        const cls = ['ros-hd', (dow === 0 || dow === 6) && 'ros-we', d === today && 'ros-t', d === selected && 'ros-s'].filter(Boolean).join(' ')
        return (
          <span key={d} className={cls}>
            <i>{WEEKDAY_LETTER[dow]}</i>
            {fromKey(d).getDate()}
          </span>
        )
      })}
    </>
  )
}

function Roster({ groups, days, today, selected, mode, detail, onSelect, onOpenPerson }: {
  groups: RosterGroup[]
  days: DateKey[]
  today: DateKey
  selected?: DateKey
  mode: RosterMode
  detail: 'month' | 'week'
  onSelect: (d: DateKey) => void
  onOpenPerson?: (id: string) => void
}) {
  const totals = mode === 'attendance' && detail === 'month'
  const cols = `150px repeat(${days.length}, minmax(0, 1fr))${totals ? ' repeat(4, 56px)' : ''}`
  const num = (n: number, tone: string, suffix = '') => <span className={`ros-tt${n > 0 ? ` ros-tt-${tone}` : ''}`}>{n > 0 ? `${n}${suffix}` : '-'}</span>
  return (
    <div className="ros-scroll">
      <div className={`ros-hm ros-${detail}`}>
        <div className="ros-row ros-hh" style={{ gridTemplateColumns: cols }}>
          <span className="ros-nm">PERSON</span>
          <DayHeads days={days} today={today} selected={selected} />
          {totals && ['PRESENT', 'LATE MIN', 'LEAVE', 'ABSENT'].map((t) => <span key={t} className="ros-th">{t}</span>)}
        </div>
        {groups.map((g) => (
          <div key={g.name}>
            <div className="ros-gh"><b>{g.name}</b><span>{g.rows.length} {g.rows.length === 1 ? 'person' : 'people'}</span></div>
            {g.rows.map((r) => (
              <div key={r.person.id} className="ros-row" style={{ gridTemplateColumns: cols }}>
                <button type="button" className="ros-nm ros-nmb" onClick={() => onOpenPerson?.(r.person.id)}><b>{r.person.name}</b></button>
                {r.cells.map((c) => (
                  <button key={c.key} type="button" className={`ros-ce ros-${c.kind}`} aria-label={c.label} onClick={() => onSelect(c.key)}>
                    <CellContent cell={c} mode={mode} />
                  </button>
                ))}
                {totals && (
                  <>
                    {num(r.summary.present + r.summary.late, 'present')}
                    {num(r.summary.lateMinutes, 'late')}
                    {num(r.summary.leave, 'leave')}
                    {num(r.summary.absent, 'absent')}
                  </>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function Key({ mode }: { mode: RosterMode }) {
  const items: { cls: string; node: React.ReactNode; name: string }[] =
    mode === 'attendance'
      ? [
          { cls: 'ros-present', node: <Check size={12} strokeWidth={3.2} aria-hidden="true" />, name: 'Present' },
          { cls: 'ros-late', node: '18m', name: 'Late or early, total minutes' },
          { cls: 'ros-leave', node: 'AL', name: 'Annual leave' },
          { cls: 'ros-leave', node: 'UL', name: 'Unpaid leave' },
          { cls: 'ros-leave', node: 'SL', name: 'Sick leave' },
          { cls: 'ros-absent', node: 'A', name: 'Absent' },
          { cls: 'ros-holiday', node: '', name: 'Holiday' },
          { cls: 'ros-weekend', node: '', name: 'Weekend' },
        ]
      : [
          { cls: 'ros-present', node: <i className="ros-dot" />, name: 'Day with visits' },
          { cls: 'ros-late', node: '', name: 'Late' },
          { cls: 'ros-leave', node: '', name: 'On leave' },
          { cls: 'ros-absent', node: '', name: 'Absent' },
          { cls: 'ros-holiday', node: '', name: 'Holiday' },
          { cls: 'ros-weekend', node: '', name: 'Weekend' },
        ]
  return (
    <div className="ros-key">
      {items.map((i) => (
        <span key={i.name} className="ros-key-i"><i className={`ros-sw ${i.cls}`}>{i.node}</i>{i.name}</span>
      ))}
    </div>
  )
}

const KIND_CHIP: Partial<Record<MarkKind, string>> = { present: 'ros-chip-present', late: 'ros-chip-late', leave: 'ros-chip-leave', absent: 'ros-chip-absent' }

function DayPanel({ data, date, mode, targets, onOpenPerson }: { data: RosterData; date: DateKey; mode: RosterMode; targets: Targets; onOpenPerson?: (id: string) => void }) {
  const list = dayList(data, date, targets)
  const groups = data.people.reduce<{ name: string; people: DayPerson[] }[]>((acc, p) => {
    const dp = list.people.find((x) => x.person.id === p.id)!
    const g = acc.find((x) => x.name === p.department) ?? acc[acc.push({ name: p.department, people: [] }) - 1]
    g.people.push(dp)
    return acc
  }, [])
  const t = list.totals
  return (
    <aside className="ros-card ros-day" aria-label="Day summary">
      <p className="ros-st">{dayTitle(date)}</p>
      <p className="ros-ss">{data.people.length} people</p>
      <div className="ros-cn">
        <div className="ros-cn-p"><b>{list.counts.present}</b><small>Present</small></div>
        <div className="ros-cn-l"><b>{list.counts.late}</b><small>Late</small></div>
        <div className="ros-cn-v"><b>{list.counts.leave}</b><small>On leave</small></div>
        <div className="ros-cn-a"><b>{list.counts.absent}</b><small>Absent</small></div>
      </div>
      {mode === 'activity' && (
        <div className="ros-nums">
          <div className="ros-nr ros-top"><span className="ros-nl">Visits</span><span className="ros-nv"><b>{t.visits}</b> / {t.visitTarget}</span></div>
          <div>
            <div className="ros-nr"><span className="ros-nl">Orders</span><span className="ros-nv"><b>{t.orders.count}</b> · {money(t.orders.amount)}</span></div>
            <div className="ros-nr"><span className="ros-nl">Collection</span><span className="ros-nv"><b>{t.collection.count}</b> · {money(t.collection.amount)}</span></div>
            <div className="ros-nr"><span className="ros-nl">Appointments</span><span className="ros-nv"><b>{t.appointments}</b></span></div>
          </div>
        </div>
      )}
      {groups.map((g) => (
        <div key={g.name}>
          <p className="ros-gl">{g.name}</p>
          {g.people.map((p) => (
            <button key={p.person.id} type="button" className="ros-pr" onClick={() => onOpenPerson?.(p.person.id)}>
              <span className="ros-pn"><b>{p.person.name}</b></span>
              <span className={`ros-chip ${KIND_CHIP[p.kind] ?? ''}`}>
                {p.kind === 'present' && <Check size={12} strokeWidth={3.2} aria-hidden="true" />}
                {p.chip}
              </span>
              {mode === 'activity' && <span className="ros-pv">{p.activity ? p.activity.visits : '-'}</span>}
            </button>
          ))}
        </div>
      ))}
    </aside>
  )
}

function TeamCalendarView({ mode, data, defaultView = 'month', value, onSelect, onOpenPerson, targets = DEFAULT_TARGETS, subtitle, className = '' }: Props & { mode: RosterMode }) {
  const [view, setView] = useState<'month' | 'week'>(defaultView)
  const [cursor, setCursor] = useState<DateKey>(value ?? data.today)
  const [own, setOwn] = useState<DateKey>(value ?? data.today)
  const selected = value ?? own
  const pick = (d: DateKey) => {
    setOwn(d)
    onSelect?.(d)
  }
  const days = view === 'month' ? monthDays(cursor) : weekDays(startOfWeek(cursor, 'mon'))
  const groups = buildRoster(data, days, mode, view)
  const kpis = view === 'month' ? teamKpis(groups, data, days, mode, targets) : []
  const name = mode === 'attendance' ? 'Team attendance' : 'Team calendar'
  const title = view === 'month' ? `${name} · ${monthLabel(cursor)}` : `${name} · ${weekLabel(startOfWeek(cursor, 'mon'))}`

  return (
    <div className={`ros-wrap ${className}`}>
      <section className="ros-card" aria-label={title}>
        <div className="ros-mh">
          <div>
            <p className="ros-mt">{title}</p>
            <p className="ros-ms">{[`${data.people.length} people`, subtitle].filter(Boolean).join(' · ')}</p>
          </div>
          <div className="ros-sg" role="tablist" aria-label="Calendar view">
            {(['month', 'week'] as const).map((v) => (
              <button key={v} type="button" role="tab" aria-selected={view === v} className={view === v ? 'ros-on' : ''} onClick={() => setView(v)}>
                {v === 'month' ? 'Month' : 'Week'}
              </button>
            ))}
          </div>
          <button type="button" className="cal-today" onClick={() => { setCursor(data.today); pick(data.today) }}>Today</button>
          <button type="button" className="cal-nav" aria-label={`Previous ${view}`} onClick={() => setCursor(view === 'month' ? addMonths(cursor, -1) : addDays(cursor, -7))}>
            <ChevronLeft size={20} strokeWidth={2.4} />
          </button>
          <button type="button" className="cal-nav" aria-label={`Next ${view}`} onClick={() => setCursor(view === 'month' ? addMonths(cursor, 1) : addDays(cursor, 7))}>
            <ChevronRight size={20} strokeWidth={2.4} />
          </button>
        </div>
        {kpis.length > 0 && (
          <div className="ros-kp" style={{ gridTemplateColumns: `repeat(${kpis.length}, minmax(0, 1fr))` }}>
            {kpis.map((k) => (
              <div key={k.label} className={`ros-k ros-k-${k.tone}`}><b>{k.value}</b><span>{k.label}</span><small>{k.sub}</small></div>
            ))}
          </div>
        )}
        <Roster groups={groups} days={days} today={data.today} selected={selected} mode={mode} detail={view} onSelect={pick} onOpenPerson={onOpenPerson} />
        <Key mode={mode} />
      </section>
      <DayPanel data={data} date={selected} mode={mode} targets={targets} onOpenPerson={onOpenPerson} />
    </div>
  )
}

/** Managers' month and week roster of attendance: a check, a leave code, A or the minutes late or early in every cell, with row totals. */
export function TeamAttendanceCalendar(props: Props) {
  return <TeamCalendarView {...props} mode="attendance" />
}

/** Managers' team calendar: cell colour for late, leave, absent and holiday; a dot for a day with visits; the week shows visits and order amount. */
export function TeamCalendar(props: Props) {
  return <TeamCalendarView {...props} mode="activity" />
}
