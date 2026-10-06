import { useState } from 'react'
import { Banknote, Check, ChevronDown, Clock, XCircle, Calendar as CalendarIcon, type LucideIcon } from 'lucide-react'
import { useApprovedLeaveOnDate } from '@/features/leave/useApprovedLeaveOnDate'
import { useVisitOptions } from '@/features/visits/useVisitOptions'
import { useAppSettings } from '@/hooks/useAppSettings'
import { todayDateString } from '@/lib/dateRange'
import { formatTime } from '@/lib/datetime'
import type { FleetMemberSnapshot } from './types'
import { firstClockIn } from '@/features/attendance/sessions'

const COLLAPSED_KEY = 'footprints-team-pulse-collapsed'

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * "Team today so far" (canvas Polish › Team and Team report): clocked in
 * out of who's due (on time, late, not in) beside today's visits (ordered,
 * paid, appointments set). Collapses to a one-line summary; the choice is
 * remembered on this device.
 */
export function TeamPulseCard({ snapshots }: { snapshots: FleetMemberSnapshot[] }) {
  const settings = useAppSettings()
  const { byKind } = useVisitOptions()
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const toggle = () => {
    const next = !collapsed
    setCollapsed(next)
    try {
      localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0')
    } catch {
      /* private mode: just don't remember */
    }
  }
  const leave = useApprovedLeaveOnDate(
    snapshots.map((s) => s.member.id),
    todayDateString()
  )
  const label = (id: string | null) => {
    if (!id) return ''
    for (const list of Object.values(byKind)) {
      const o = list.find((x) => x.id === id)
      if (o) return o.label.trim().toLowerCase()
    }
    return ''
  }
  const onLeave = snapshots.filter((s) => leave[s.member.id] && !s.attendance).length
  const worked = snapshots.filter((s) => s.attendance)
  const due = snapshots.length - onLeave
  const [sh, sm] = settings.workStartTime.split(':').map(Number)
  const lateAfter = sh * 60 + sm + settings.lateGraceMinutes
  const late = worked.filter((s) => {
    // Late is judged on the first clock-in; a later session (after lunch) doesn't count.
    const [h, m] = formatTime(firstClockIn(s.sessions) ?? s.attendance!.clock_in_at).split(':').map(Number)
    return h * 60 + m > lateAfter
  }).length
  const visits = snapshots.flatMap((s) => s.visitsToday.filter((v) => !v.cancelled_at))
  const ordered = visits.filter((v) => label(v.order_status_id) === 'ordered').length
  const paid = visits.filter((v) => /full|part/.test(label(v.payment_status_id))).length
  const part = visits.filter((v) => /part/.test(label(v.payment_status_id))).length
  const appts = visits.filter((v) => v.next_appointment).length

  return (
    <section aria-label="Team today so far" className="rounded-2xl border border-neutral-100 bg-white px-3.5 pb-3.5 pt-1 shadow-card">
      <button type="button" onClick={toggle} aria-expanded={!collapsed} aria-controls="team-pulse-body" className="flex w-full items-center gap-2 py-2 text-left">
        <span className="min-w-0 flex-1">
          <span className="block text-[12px] font-extrabold uppercase tracking-wide text-neutral-500">Team today so far</span>
          {collapsed && (
            <span className="mt-0.5 block truncate text-[14px] font-bold text-neutral-900">
              {worked.length}/{due} clocked in
              {late > 0 && <span className="text-status-warn"> · {late} late</span>}
              {due > worked.length && <span className="text-status-danger"> · {due - worked.length} not in</span>} · {visits.length} {visits.length === 1 ? 'visit' : 'visits'}
            </span>
          )}
        </span>
        <span className="text-[12.5px] font-bold text-brand-600">{collapsed ? 'Show' : 'Hide'}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-neutral-500 transition-transform ${collapsed ? '' : 'rotate-180'}`} aria-hidden />
      </button>
      {!collapsed && (
        <div id="team-pulse-body">
          <Pulse
            label="Clocked in"
            value={worked.length}
            of={due}
            note={onLeave ? `${onLeave} on leave today` : 'Nobody on leave today'}
            rows={[
              { label: 'On time', value: worked.length - late, icon: Check, tone: 'text-status-working' },
              { label: 'Late', value: late, icon: Clock, tone: 'text-status-warn', muteZero: true },
              { label: 'Not clocked in', value: Math.max(0, due - worked.length), icon: XCircle, tone: 'text-status-danger', muteZero: true },
            ]}
          />
          <Pulse
            label="Visits"
            value={visits.length}
            note="So far today"
            border
            rows={[
              { label: 'Ordered', value: ordered, icon: Check, tone: 'text-status-working' },
              { label: 'Payment', value: paid, extra: part ? ` · ${part} part` : '', icon: Banknote, tone: 'text-status-working' },
              { label: 'Appt.', value: appts, icon: CalendarIcon, tone: 'text-status-warn' },
            ]}
          />
        </div>
      )}
    </section>
  )
}

/** One half of the "today so far" card: a big number with a note, then three counts. */
function Pulse({
  label,
  value,
  of,
  note,
  rows,
  border = false,
}: {
  label: string
  value: number
  of?: number
  note: string
  rows: { label: string; value: number; extra?: string; icon: LucideIcon; tone: string; muteZero?: boolean }[]
  border?: boolean
}) {
  return (
    <div className={`flex gap-3 ${border ? 'mt-3 border-t border-neutral-100 pt-3 dark:border-neutral-800' : ''}`}>
      <div className="w-[38%] shrink-0">
        <p className="text-xs font-semibold text-neutral-500">{label}</p>
        <p className="text-[28px] font-extrabold leading-8 text-neutral-900">
          {value}
          {of != null && <span className="text-base font-bold text-neutral-500"> / {of}</span>}
        </p>
        <p className="text-[11px] text-neutral-500">{note}</p>
      </div>
      <div className="min-w-0 flex-1">
        {rows.map((r, i) => (
          <div key={r.label} className={`flex items-center justify-between gap-2 py-1 ${i ? 'border-t border-neutral-100 dark:border-neutral-800' : ''}`}>
            <span className="inline-flex items-center gap-1.5 text-[13px] text-neutral-700">
              <r.icon className={`h-3.5 w-3.5 ${r.tone}`} aria-hidden />
              {r.label}
            </span>
            <span className={`text-sm font-bold ${r.muteZero && r.value === 0 ? 'text-neutral-400' : r.muteZero ? r.tone : 'text-neutral-900'}`}>
              {r.value}
              {r.extra && <span className="text-xs font-semibold text-neutral-500">{r.extra}</span>}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
