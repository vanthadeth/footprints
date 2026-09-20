import { Building2, Check, LogIn, LogOut } from 'lucide-react'
import { useCustomerNames } from '@/features/customers/useCustomerNames'
import { useVisitOptions } from '@/features/visits/useVisitOptions'
import type { VisitOption } from '@/features/visits/visitOptionsService'
import type { AttendanceRow, VisitRow } from '@/features/attendance/types'
import type { TeamMember } from '@/features/fleet/types'
import { displayName } from '@/lib/displayName'
import { formatDuration, formatTime } from '@/lib/datetime'
import { buildActivityLog, groupActivityLogByDay, type ActivityLogEntry } from './activityLog'

/** "YYYY-MM-DD" -> "DD/MM/YYYY", matching formatDate's shape without re-interpreting an already-resolved calendar date through another timezone conversion. */
function formatDayKey(dateKey: string): string {
  const [y, m, d] = dateKey.split('-')
  return `${d}/${m}/${y}`
}

const KIND_ICON = {
  'clock-in': LogIn,
  'clock-out': LogOut,
  'check-in': Building2,
  'check-out': Check,
} as const

const KIND_TONE = {
  'clock-in': 'bg-status-working/10 text-status-working',
  'clock-out': 'bg-earth-500/10 text-earth-600',
  'check-in': 'bg-status-visiting/10 text-status-visiting',
  'check-out': 'bg-neutral-900/10 text-neutral-700',
} as const

/** A flat, chronological feed of every clock-in/out and visit check-in/out across the reported team, grouped Day -> Morning/Afternoon. */
export function ActivityLogTab({ team, attendance, visits }: { team: TeamMember[]; attendance: AttendanceRow[]; visits: VisitRow[] }) {
  const customerNames = useCustomerNames(visits.map((v) => v.customer_id))
  const { byKind } = useVisitOptions()
  const optionsById: Record<string, VisitOption> = {}
  for (const options of Object.values(byKind)) {
    for (const o of options) optionsById[o.id] = o
  }
  const nameById = Object.fromEntries(team.map((m) => [m.id, displayName(m.fullName, m.nickname)]))

  const days = groupActivityLogByDay(buildActivityLog(attendance, visits))

  function describe(entry: ActivityLogEntry): string {
    if (entry.kind === 'clock-in') return 'Clock In'
    if (entry.kind === 'clock-out') return 'Clock Out'

    const customerLabel = entry.customerId ? customerNames[entry.customerId] ?? 'Loading…' : 'Unassigned Visit'
    if (entry.kind === 'check-in') return `Check In — ${customerLabel}`

    const result = [entry.visitStatusId, entry.orderStatusId, entry.paymentStatusId]
      .map((id) => (id ? optionsById[id]?.label : null))
      .filter((label): label is string => !!label)
      .join(' | ')
    return `Check Out — ${customerLabel} · ${formatDuration(entry.durationMs ?? 0)}${result ? ` · ${result}` : ''}`
  }

  if (days.length === 0) {
    return <p className="mt-4 rounded-xl2 bg-white p-8 text-center text-sm text-neutral-400 shadow-card">No activity recorded for this period.</p>
  }

  return (
    <div className="mt-4 space-y-5">
      {days.map((day) => (
        <div key={day.dateKey}>
          <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-neutral-400">{formatDayKey(day.dateKey)}</p>
          <div className="space-y-3">
            {day.periods.map(({ period, entries }) => (
              <div key={period} className="rounded-xl2 bg-white p-3 shadow-card">
                <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                  {period === 'morning' ? 'Morning' : 'Afternoon'}
                </p>
                <div className="space-y-1.5">
                  {entries.map((entry) => {
                    const Icon = KIND_ICON[entry.kind]
                    return (
                      <div key={entry.id} className="flex items-center gap-2.5 rounded-lg px-1 py-1.5">
                        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${KIND_TONE[entry.kind]}`}>
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="w-12 shrink-0 font-mono text-xs font-semibold text-neutral-500">{formatTime(entry.time)}</span>
                        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-neutral-900">{nameById[entry.userId] ?? 'Unknown'}</span>
                        <span className="min-w-0 flex-[2] truncate text-right text-xs text-neutral-500">{describe(entry)}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
