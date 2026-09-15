import { User } from 'lucide-react'
import { BottomSheet } from '@/components/BottomSheet'
import { FlagBadge } from '@/components/FlagBadge'
import { JourneyTimeline } from '@/features/attendance/JourneyTimeline'
import { JourneyMap } from '@/features/attendance/JourneyMap'
import { useCustomerNames } from '@/features/customers/useCustomerNames'
import { displayName } from '@/lib/displayName'
import { formatDuration, formatTime } from '@/lib/datetime'
import { Freshness } from './Freshness'
import { FleetStatusBadge } from './FleetStatusBadge'
import type { FleetMemberSnapshot } from './types'

export function FleetMemberDetail({ snapshot, onClose }: { snapshot: FleetMemberSnapshot | null; onClose: () => void }) {
  const customerNames = useCustomerNames(snapshot?.visitsToday.map((v) => v.customer_id) ?? [])
  if (!snapshot) return null

  const { member, status, attendance, openVisit, visitsToday, lastLocation } = snapshot
  const totalVisitMs = visitsToday.reduce((sum, v) => {
    const end = v.checked_out_at ? new Date(v.checked_out_at).getTime() : Date.now()
    return sum + Math.max(0, end - new Date(v.checked_in_at).getTime())
  }, 0)
  const flags = [...new Set(visitsToday.flatMap((v) => v.flags ?? []))]

  return (
    <BottomSheet open={!!snapshot} onClose={onClose} title={displayName(member.fullName, member.nickname)}>
      <div className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-500">
            <User className="h-6 w-6" />
          </div>
          <div>
            <p className="font-semibold text-neutral-900">{displayName(member.fullName, member.nickname)}</p>
            <p className="text-xs text-neutral-500">{member.position ?? member.roleName}</p>
          </div>
          <div className="ml-auto">
            <FleetStatusBadge status={status} />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-neutral-50 p-2.5">
            <p className="text-xs text-neutral-400">Clock In</p>
            <p className="text-sm font-semibold text-neutral-900">{attendance ? formatTime(attendance.clock_in_at) : '—'}</p>
          </div>
          <div className="rounded-xl bg-neutral-50 p-2.5">
            <p className="text-xs text-neutral-400">Visits</p>
            <p className="text-sm font-semibold text-neutral-900">{visitsToday.length}</p>
          </div>
          <div className="rounded-xl bg-neutral-50 p-2.5">
            <p className="text-xs text-neutral-400">Visit Time</p>
            <p className="text-sm font-semibold text-neutral-900">{formatDuration(totalVisitMs)}</p>
          </div>
        </div>

        {status === 'VISITING' && openVisit && (
          <div className="mt-4 rounded-xl bg-status-visiting/10 p-3">
            <p className="text-xs font-semibold text-status-visiting">
              Currently visiting {openVisit.customer_id ? customerNames[openVisit.customer_id] ?? 'Loading…' : 'Unassigned'}
            </p>
            <p className="text-xs text-neutral-500">Since {formatTime(openVisit.checked_in_at)}</p>
          </div>
        )}

        {lastLocation && (
          <div className="mt-4 flex items-center justify-between rounded-xl bg-neutral-50 px-3 py-2.5">
            <p className="text-xs text-neutral-500">Last known location</p>
            <Freshness at={lastLocation.at} />
          </div>
        )}

        {flags.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {flags.map((f) => (
              <FlagBadge key={f} flag={f} />
            ))}
          </div>
        )}

        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">Journey Map</p>
          {/* Fleet's snapshot only ever keeps this member's most recent
              session today (fleetService.fetchSnapshot) -- fine for a live
              glance, so only that one session's clock in/out pin shows here
              even on a day with more than one. */}
          <JourneyMap visits={visitsToday} attendance={attendance ? [attendance] : []} customerNames={customerNames} />
        </div>

        {attendance && (
          <div className="mt-4 rounded-xl2 border border-neutral-100 p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-400">Today's Timeline</p>
            <JourneyTimeline attendance={[attendance]} visits={visitsToday} customerNames={customerNames} />
          </div>
        )}
      </div>
    </BottomSheet>
  )
}
