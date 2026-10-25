import { useState } from 'react'
import { CalendarDays, Clock, UserCheck, UserX, Users } from 'lucide-react'
import { DayStrip } from './DayStrip'
import { filterPeople, initials, isLate, leaveSplitText, overviewKpis, sortPeople, type OverviewFilter, type OverviewPerson } from './teamOverview'

interface Props {
  people: OverviewPerson[]
  defaultFilter?: OverviewFilter
  loading?: boolean
  onOpenPerson?: (personId: string) => void
  className?: string
}

const TILES: { key: Exclude<OverviewFilter, 'all'>; label: string; tone: string; Icon: typeof Users }[] = [
  { key: 'in', label: 'Clocked in', tone: 'ok', Icon: UserCheck },
  { key: 'leave', label: 'On leave', tone: 'lv', Icon: CalendarDays },
  { key: 'absent', label: 'Absent', tone: 'bad', Icon: UserX },
  { key: 'late', label: 'Late', tone: 'amb', Icon: Clock },
]

const dot = (p: OverviewPerson) => (p.state === 'absent' ? 'bad' : p.state === 'leave' || p.state === 'waiting' ? 'mu' : isLate(p) ? 'amb' : 'ok')

const rowLabel = (p: OverviewPerson) =>
  p.state === 'absent'
    ? `${p.name}, absent, no clock-in`
    : p.state === 'leave'
      ? `${p.name}, on leave${p.leaveCode ? ` (${p.leaveCode})` : ''}`
      : p.state === 'waiting'
        ? `${p.name}, ${(p.note ?? 'not clocked in yet').toLowerCase()}`
        : `${p.name}, clocked in${p.clockIn ? ` at ${p.clockIn}` : ''}${isLate(p) ? `, ${p.lateMinutes} minutes late` : ''}`

/**
 * The manager's Team screen body: four numbers that filter the list (clocked in, on leave, absent, late with total
 * minutes), then each person with an avatar, name and their day strip. Late is a subset of clocked in.
 */
export function TeamOverview({ people, defaultFilter = 'all', loading = false, onOpenPerson, className = '' }: Props) {
  const [filter, setFilter] = useState<OverviewFilter>(defaultFilter)
  const k = overviewKpis(people)
  const rows = sortPeople(filterPeople(people, filter))
  const none = people.length === 0
  const counts = { in: k.clockedIn, leave: k.onLeave, absent: k.absent, late: k.late }
  const subs = {
    in: none ? 'no one yet' : `of ${k.total} ${k.total === 1 ? 'person' : 'people'}`,
    leave: none ? 'no one yet' : k.onLeave ? leaveSplitText(k) : 'nobody today',
    absent: none ? 'no one yet' : k.absent ? 'no clock-in, not on leave' : 'nobody today',
    late: none ? 'no one yet' : k.late ? `${k.lateMinutes} min in total` : 'on time today',
  }
  const filtered = filter !== 'all' && !none
  return (
    <div className={`tov ${className}`.trim()}>
      <section className="tov-tiles" aria-label="Team today">
        {TILES.map(({ key, label, tone, Icon }) => (
          <button
            key={key}
            type="button"
            className={`tov-tile${filter === key ? ' tov-on' : ''}`}
            aria-pressed={filter === key}
            aria-label={`${label}: ${counts[key]}, ${subs[key]}${filter === key ? ', filter on' : ''}`}
            onClick={() => setFilter(filter === key ? 'all' : key)}
          >
            <span className="tov-th">
              <span className={`tov-ti tov-${tone}`} aria-hidden="true">
                <Icon size={14} strokeWidth={2.2} />
              </span>
              <span className="tov-tlb">{label}</span>
              <span className="tov-tn">{counts[key]}</span>
            </span>
            <span className="tov-tsb">{subs[key]}</span>
          </button>
        ))}
      </section>

      <section className="tov-card" aria-label="Your team">
        <div className="tov-lh">
          <span className="tov-lt">
            Your team <span>· {k.total}</span>
          </span>
          <span className="tov-lr">
            {none ? '' : filtered ? `Showing ${rows.length} of ${k.total}` : 'Tap a number to filter'}
            {filtered && (
              <button type="button" className="tov-clr" onClick={() => setFilter('all')}>
                Clear
              </button>
            )}
          </span>
        </div>
        {loading && none && <div className="tov-skel" aria-hidden="true" />}
        {!loading && none && (
          <div className="tov-emp">
            <span className="tov-ec" aria-hidden="true">
              <Users size={24} strokeWidth={1.9} />
            </span>
            <b>No one reports to you yet</b>
            <p>People who report to you appear here with their day as soon as they are added to your team.</p>
          </div>
        )}
        {rows.map((p) => (
          <button key={p.id} type="button" className="tov-row" aria-label={rowLabel(p)} onClick={() => onOpenPerson?.(p.id)}>
            <span className="tov-av">
              {initials(p.name)}
              <i className={`tov-dot tov-d-${dot(p)}`} />
            </span>
            <span className="tov-rc">
              <span className="tov-nm">
                {p.name}
                {isLate(p) && <i> · {p.lateMinutes}m late</i>}
                {p.state === 'absent' && <i className="tov-bad"> · Absent · no clock-in</i>}
              </span>
              {p.state === 'in' && p.strip ? (
                <DayStrip day={p.strip} thin />
              ) : (
                <span className={`tov-track ${p.state === 'absent' ? 'tov-abs' : 'tov-hatch'}`} role="img" aria-label={p.state === 'leave' ? 'On leave today' : p.state === 'absent' ? 'Absent today' : (p.note ?? 'Not clocked in yet')}>
                  {p.state === 'leave' && <span className="tov-tl">On leave{p.leaveCode ? ` · ${p.leaveCode}` : ''}</span>}
                  {p.state === 'waiting' && <span className="tov-tl">{p.note ?? 'Not clocked in yet'}</span>}
                </span>
              )}
            </span>
          </button>
        ))}
      </section>
    </div>
  )
}
