import { useState } from 'react'
import { User } from 'lucide-react'
import { useAvatarUrl } from '@/features/auth/useAvatarUrl'
import { useCustomerNames } from '@/features/customers/useCustomerNames'
import { displayName } from '@/lib/displayName'
import { groupBy, sortGroupKeys } from '@/lib/groupBy'
import { FleetMemberDetail } from './FleetMemberDetail'
import { FleetStatusBadge } from './FleetStatusBadge'
import { Freshness } from './Freshness'
import type { FleetMemberSnapshot } from './types'

const NO_DEPARTMENT = 'No Department'

/** "List of my fleet" (spec): photo, name, status, and -- when visiting -- the customer's actual name as the subtitle. Grouped by department. */
export function FleetListView({ snapshots }: { snapshots: FleetMemberSnapshot[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = snapshots.find((s) => s.member.id === selectedId) ?? null
  const customerNames = useCustomerNames(snapshots.map((s) => s.openVisit?.customer_id ?? null))

  const groups = groupBy(snapshots, (s) => s.member.departmentName ?? NO_DEPARTMENT)
  const orderedKeys = sortGroupKeys(groups.keys(), NO_DEPARTMENT)

  return (
    <div className="space-y-4">
      {orderedKeys.map((key) => (
        <div key={key}>
          <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-neutral-400">{key}</p>
          <div className="space-y-2">
            {groups.get(key)!.map((s) => (
              <FleetListRow
                key={s.member.id}
                snapshot={s}
                customerName={s.openVisit?.customer_id ? customerNames[s.openVisit.customer_id] : null}
                onClick={() => setSelectedId(s.member.id)}
              />
            ))}
          </div>
        </div>
      ))}

      <FleetMemberDetail snapshot={selected} onClose={() => setSelectedId(null)} />
    </div>
  )
}

function FleetListRow({
  snapshot,
  customerName,
  onClick,
}: {
  snapshot: FleetMemberSnapshot
  customerName: string | null | undefined
  onClick: () => void
}) {
  const avatarUrl = useAvatarUrl(snapshot.member.photoPath)
  const subtitle =
    snapshot.status === 'VISITING' ? customerName ?? (snapshot.openVisit?.customer_id ? 'Loading…' : 'Unassigned visit') : snapshot.member.position ?? '—'

  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 rounded-xl2 bg-white p-3.5 text-left shadow-card tap-target">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-neutral-100 text-neutral-400">
        {avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" /> : <User className="h-5 w-5" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-neutral-900">{displayName(snapshot.member.fullName, snapshot.member.nickname)}</p>
        <p className="truncate text-xs text-neutral-500">{subtitle}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <FleetStatusBadge status={snapshot.status} />
        {snapshot.lastLocation && <Freshness at={snapshot.lastLocation.at} />}
      </div>
    </button>
  )
}
