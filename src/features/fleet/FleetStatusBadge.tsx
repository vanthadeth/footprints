import type { FleetStatus } from './types'

const STYLES: Record<FleetStatus, string> = {
  VISITING: 'bg-status-visiting/10 text-status-visiting',
  IDLING: 'bg-status-idling/10 text-status-idling',
  OFF: 'bg-neutral-100 text-status-off',
}

/** Spec wording ("Off work, Idling, Visiting") -- the FleetStatus type itself stays OFF/IDLING/VISITING. */
export const FLEET_STATUS_LABELS: Record<FleetStatus, string> = {
  VISITING: 'Visiting',
  IDLING: 'Idling',
  OFF: 'Off work',
}

export function FleetStatusBadge({ status }: { status: FleetStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${STYLES[status]}`}>
      {FLEET_STATUS_LABELS[status]}
    </span>
  )
}
