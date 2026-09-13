import { Truck } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'

/** Supervisor/management view: salesperson statuses, map, dashboard, reports. */
export function FleetPage() {
  return (
    <div className="mx-auto max-w-lg md:max-w-5xl">
      <PageHeader title="Fleet" subtitle="Team status and locations" />
      <EmptyState
        icon={Truck}
        title="Coming soon"
        body="Once your team starts clocking in, their live status and map will appear here."
      />
    </div>
  )
}
