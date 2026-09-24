import { useState } from 'react'
import { SegmentedControl } from '@/components/SegmentedControl'
import { PeopleMap } from './PeopleMap'
import { RoutesMap } from './RoutesMap'
import { CustomersMap } from './CustomersMap'
import type { FleetMemberSnapshot } from '../types'

type View = 'people' | 'routes' | 'customers'

/** Team › Map: where everyone was last seen, one person's route for a day, and which customers have (or haven't) been visited. */
export function TeamMapView({ snapshots }: { snapshots: FleetMemberSnapshot[] }) {
  const [view, setView] = useState<View>('people')
  const [routeUserId, setRouteUserId] = useState<string | null>(null)

  return (
    <div className="space-y-3">
      <SegmentedControl
        ariaLabel="Map view"
        shape="tabs"
        value={view}
        onChange={setView}
        options={[
          { value: 'people', label: 'People' },
          { value: 'routes', label: 'Routes' },
          { value: 'customers', label: 'Customers' },
        ]}
      />
      {view === 'people' && (
        <PeopleMap
          snapshots={snapshots}
          onShowRoute={(id) => {
            setRouteUserId(id)
            setView('routes')
          }}
        />
      )}
      {view === 'routes' && <RoutesMap snapshots={snapshots} userId={routeUserId} onUserChange={setRouteUserId} />}
      {view === 'customers' && <CustomersMap team={snapshots.map((s) => s.member)} />}
    </div>
  )
}
