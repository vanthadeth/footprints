import { useState } from 'react'
import { User } from 'lucide-react'
import { FleetMap } from './FleetMap'
import { FleetStatusBadge } from './FleetStatusBadge'
import { FleetMemberDetail } from './FleetMemberDetail'
import { Freshness } from './Freshness'
import type { FleetMemberSnapshot } from './types'

export function FleetOverview({ snapshots, lastUpdatedAt }: { snapshots: FleetMemberSnapshot[]; lastUpdatedAt: number | null }) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = snapshots.find((s) => s.member.id === selectedId) ?? null

  return (
    <div>
      <div className="flex items-center justify-between px-1 pb-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Fleet Map</p>
        {lastUpdatedAt && <Freshness at={new Date(lastUpdatedAt).toISOString()} />}
      </div>
      <FleetMap snapshots={snapshots} onSelect={setSelectedId} />

      <div className="mt-4 space-y-2">
        {snapshots.map((s) => (
          <button
            key={s.member.id}
            onClick={() => setSelectedId(s.member.id)}
            className="flex w-full items-center gap-3 rounded-xl2 bg-white p-3.5 text-left shadow-card tap-target"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-400">
              <User className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-neutral-900">{s.member.fullName}</p>
              <p className="truncate text-xs text-neutral-500">
                {s.status === 'VISITING' && s.openVisit ? 'Visiting a customer' : s.member.position ?? '—'}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <FleetStatusBadge status={s.status} />
              {s.lastLocation && <Freshness at={s.lastLocation.at} />}
            </div>
          </button>
        ))}
      </div>

      <FleetMemberDetail snapshot={selected} onClose={() => setSelectedId(null)} />
    </div>
  )
}
