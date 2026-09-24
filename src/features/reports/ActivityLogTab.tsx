import { useState } from 'react'
import { useCustomerNames } from '@/features/customers/useCustomerNames'
import { useVisitOptions } from '@/features/visits/useVisitOptions'
import type { VisitOption } from '@/features/visits/visitOptionsService'
import type { TeamMember } from '@/features/fleet/types'
import { displayName } from '@/lib/displayName'
import { formatDuration, formatTime } from '@/lib/datetime'
import { getPresetRange, todayDateString } from '@/lib/dateRange'
import { PeriodChips } from './PeriodChips'
import { useFleetHistory } from './useFleetHistory'
import { buildActivityLog, groupActivityLogByDay, isAlertEntry, type ActivityLogEntry } from './activityLog'

type Filter = 'all' | 'attendance' | 'visits' | 'alerts'

const FLAG_TEXT: Record<string, string> = {
  LOW_LOCATION_ACCURACY: 'low GPS accuracy',
  LOCATION_UNAVAILABLE: 'no location',
  AUTO_CHECKOUT_OUTSIDE_RADIUS: 'left the customer radius',
  AUTO_CHECKOUT_CLOCK_OUT: 'clocked out mid-visit',
  TRACKING_INTERRUPTED: 'tracking interrupted',
  OUT_OF_RANGE: 'checked in outside the radius',
}

/** "YYYY-MM-DD" -> "Thu, 24 Sep" (with Today/Yesterday), without re-interpreting an already-resolved date through a timezone. */
function formatDayKey(dateKey: string): string {
  const today = todayDateString()
  const [y, m, d] = dateKey.split('-').map(Number)
  const label = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
  const yesterday = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1, Number(today.slice(8, 10)) - 1)).toISOString().slice(0, 10)
  if (dateKey === today) return `Today · ${label}`
  if (dateKey === yesterday) return `Yesterday · ${label}`
  return label
}

function status(entry: ActivityLogEntry): { label: string; tone: string } {
  switch (entry.kind) {
    case 'clock-in':
      return { label: 'Clock In', tone: 'bg-status-working/10 text-status-working dark:text-emerald-300' }
    case 'clock-out':
      return entry.auto ? { label: 'Auto Clock Out', tone: 'bg-status-warn/10 text-status-warn' } : { label: 'Clock Out', tone: 'bg-neutral-100 text-neutral-600' }
    case 'check-in':
      return isAlertEntry(entry) ? { label: 'Check In · Out of range', tone: 'bg-status-warn/10 text-status-warn' } : { label: 'Check In', tone: 'bg-brand-50 text-brand-700' }
    case 'check-out':
      if (entry.auto) return { label: 'Auto Check Out', tone: 'bg-status-warn/10 text-status-warn' }
      if (isAlertEntry(entry)) return { label: 'Check Out · Flagged', tone: 'bg-status-warn/10 text-status-warn' }
      return { label: 'Check Out', tone: 'bg-status-visiting/10 text-status-visiting dark:text-violet-300' }
  }
}

/** Team › Logs: every clock-in/out and visit check-in/out across the team, newest first, grouped Day -> Afternoon/Morning, filterable to just alerts. */
export function ActivityLogTab({ team }: { team: TeamMember[] }) {
  const [range, setRange] = useState(() => getPresetRange('today'))
  const [filter, setFilter] = useState<Filter>('all')
  const { attendance, visits, loading } = useFleetHistory(
    team.map((m) => m.id),
    range
  )
  const customerNames = useCustomerNames(visits.map((v) => v.customer_id))
  const { byKind } = useVisitOptions()
  const optionsById: Record<string, VisitOption> = {}
  for (const options of Object.values(byKind)) {
    for (const o of options) optionsById[o.id] = o
  }
  const nameById = Object.fromEntries(team.map((m) => [m.id, displayName(m.fullName, m.nickname)]))

  const all = buildActivityLog(attendance, visits)
  const matches = (e: ActivityLogEntry, f: Filter) =>
    f === 'all' ? true : f === 'alerts' ? isAlertEntry(e) : f === 'attendance' ? e.kind === 'clock-in' || e.kind === 'clock-out' : e.kind === 'check-in' || e.kind === 'check-out'
  const days = groupActivityLogByDay(all.filter((e) => matches(e, filter)))

  function describe(entry: ActivityLogEntry): string {
    const flagText = (entry.flags ?? []).map((f) => FLAG_TEXT[f]).filter(Boolean)
    if (entry.kind === 'clock-in') return 'Started the day'
    if (entry.kind === 'clock-out') return entry.auto ? 'Closed automatically after the end of the day' : 'Ended the day'
    const customerLabel = entry.customerId ? customerNames[entry.customerId] ?? 'Loading…' : 'Unassigned visit'
    if (entry.kind === 'check-in') return [customerLabel, ...flagText].join(' · ')
    const result = [entry.visitStatusId, entry.orderStatusId, entry.paymentStatusId]
      .map((id) => (id ? optionsById[id]?.label : null))
      .filter((label): label is string => !!label)
      .join(' | ')
    return [customerLabel, formatDuration(entry.durationMs ?? 0), result, ...flagText].filter(Boolean).join(' · ')
  }

  const filters: { key: Filter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'attendance', label: 'Attendance' },
    { key: 'visits', label: 'Visits' },
    { key: 'alerts', label: 'Alerts' },
  ]

  return (
    <div className="space-y-3.5">
      <PeriodChips value={range} onChange={setRange} />
      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 md:mx-0 md:px-0">
        {filters.map((f) => {
          const active = filter === f.key
          return (
            <button
              key={f.key}
              type="button"
              aria-pressed={active}
              onClick={() => setFilter(f.key)}
              className={`flex h-9 shrink-0 items-center gap-1.5 rounded-full border-[1.5px] px-3.5 text-xs font-bold ${
                active ? 'border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900' : 'border-neutral-200 bg-white text-neutral-600'
              }`}
            >
              {f.label}
              <span className="opacity-70">{all.filter((e) => matches(e, f.key)).length}</span>
            </button>
          )
        })}
      </div>

      {loading ? (
        <div className="h-40 animate-pulse rounded-xl2 bg-neutral-100" />
      ) : days.length === 0 ? (
        <p className="rounded-2xl bg-white p-8 text-center text-sm text-neutral-500 shadow-card">No activity recorded for this period.</p>
      ) : (
        days.map((day) => (
          <section key={day.dateKey} className="space-y-2.5">
            <div className="flex items-baseline justify-between px-0.5">
              <h3 className="text-sm font-bold text-neutral-900">{formatDayKey(day.dateKey)}</h3>
              <span className="text-xs text-neutral-500">{day.periods.reduce((a, p) => a + p.entries.length, 0)} entries</span>
            </div>
            {day.periods.map(({ period, entries }) => (
              <div key={period} className="space-y-2">
                <p className="px-0.5 text-[11px] font-bold uppercase tracking-wider text-neutral-500">{period === 'morning' ? 'Morning' : 'Afternoon'}</p>
                {entries.map((entry) => {
                  const st = status(entry)
                  return (
                    <div key={entry.id} className="rounded-xl bg-white px-3.5 py-3 shadow-card">
                      <div className="flex items-center gap-2.5">
                        <span className="w-11 shrink-0 font-mono text-[13px] font-bold text-neutral-900">{formatTime(entry.time)}</span>
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-neutral-900">{nameById[entry.userId] ?? 'Unknown'}</span>
                        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${st.tone}`}>{st.label}</span>
                      </div>
                      <div className="my-2.5 h-px bg-neutral-100 dark:bg-neutral-800" />
                      <p className="text-[12.5px] leading-relaxed text-neutral-600">{describe(entry)}</p>
                    </div>
                  )
                })}
              </div>
            ))}
          </section>
        ))
      )}
    </div>
  )
}
