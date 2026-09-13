import { Footprints as FootprintsIcon } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'

/**
 * Personal journey history: today's attendance, timeline, visit map,
 * date filters. Built out in the next pass (Phase 5/6) once check-in/out
 * is producing real data to show.
 */
export function FootprintsPage() {
  return (
    <div className="mx-auto max-w-lg md:max-w-3xl">
      <PageHeader title="Footprints" subtitle="Your journey history" />
      <EmptyState
        icon={FootprintsIcon}
        title="Coming soon"
        body="Your daily timeline, visit map, and journey stats will show up here."
      />
    </div>
  )
}
