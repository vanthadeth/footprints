import { useState } from 'react'
import { CalendarDays, Clock, UserCheck, UserX, Users } from 'lucide-react'
import { DayStrip } from './DayStrip'
import { filterPeople, groupByDepartment, infoPills, initials, isLate, leaveSplitText, overviewKpis, statusChip, statusLine, type OverviewFilter, type OverviewPerson } from './teamOverview'

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

const personLabel = (p: OverviewPerson) => {
  const chip = statusChip(p).text
  const facts = p.state === 'in' && p.info ? `, ${infoPills(p.info).map((x) => x.text).join(', ')}` : ''
  return `${p.name}, ${chip.toLowerCase()}, ${statusLine(p).toLowerCase()}${facts}`
}

/**
 * The manager's Team screen body: four numbers that filter the list (clocked in, on leave, absent, late with total
 * minutes), then one card per person grouped by department: avatar, name, status, day strip and the day's numbers.
 * Late is a subset of clocked in.
 */
export function TeamOverview({ people, defaultFilter = 'all', loading = false, onOpenPerson, className = '' }: Props) {
  const [filter, setFilter] = useState<OverviewFilter>(defaultFilter)
  const k = overviewKpis(people)
  const shown = filterPeople(people, filter)
  const groups = groupByDepartment(shown)
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

      <section aria-label="Your team">
        <div className="tov-lh">
          <span className="tov-lt">
            Your team <span>· {k.total}</span>
          </span>
          <span className="tov-lr">
            {none ? '' : filtered ? `Showing ${shown.length} of ${k.total}` : 'Tap a number to filter'}
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
        {groups.map((g) => (
          <div key={g.name} className="tov-grp">
            <div className="tov-gh">
              <b>{g.name}</b>
              <span>{g.people.length}</span>
            </div>
            {g.people.map((p) => {
              const chip = statusChip(p)
              return (
                <button key={p.id} type="button" className="tov-person" aria-label={personLabel(p)} onClick={() => onOpenPerson?.(p.id)}>
                  <span className="tov-rh">
                    <span className="tov-av">
                      {initials(p.name)}
                      <i className={`tov-dot tov-d-${dot(p)}`} />
                    </span>
                    <span className="tov-rt">
                      <span className="tov-nm">{p.name}</span>
                      <span className="tov-sub">{statusLine(p)}</span>
                    </span>
                    <span className={`tov-chip tov-c-${chip.tone}`}>{chip.text}</span>
                  </span>
                  {p.state === 'in' && p.strip ? (
                    <DayStrip day={p.strip} thin />
                  ) : (
                    <span className={`tov-track ${p.state === 'absent' ? 'tov-abs' : 'tov-hatch'}`} role="img" aria-label={p.state === 'leave' ? 'On leave today' : p.state === 'absent' ? 'Absent today' : (p.note ?? 'Not clocked in yet')} />
                  )}
                  {p.state === 'in' && p.info && (
                    <span className="tov-inf">
                      {infoPills(p.info).map((x) => (
                        <span key={x.text} className={`tov-pl${x.amount ? ' tov-amt' : ''}`}>
                          {x.text}
                        </span>
                      ))}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        ))}
      </section>
    </div>
  )
}
