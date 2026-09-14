import { useState } from 'react'
import { FleetMap } from './FleetMap'
import { FleetMemberDetail } from './FleetMemberDetail'
import type { FleetMemberSnapshot } from './types'

/** "Map view" (spec): everyone's last location ping, tap a pin for their current status. Its own dedicated view now, not squeezed above the list. */
export function FleetMapView({ snapshots }: { snapshots: FleetMemberSnapshot[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = snapshots.find((s) => s.member.id === selectedId) ?? null

  return (
    <div>
      <FleetMap snapshots={snapshots} onSelect={setSelectedId} height="calc(100dvh - 15rem)" />
      <FleetMemberDetail snapshot={selected} onClose={() => setSelectedId(null)} />
    </div>
  )
}
