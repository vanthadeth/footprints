import type { FleetStatus } from './types'

const STYLES: Record<FleetStatus, string> = {
  VISITING: 'bg-status-visiting/10 text-status-visiting',
  IDLING: 'bg-status-idling/10 text-status-idling',
  OFF: 'bg-neutral-100 text-status-off',
}

export function FleetStatusBadge({ status }: { status: FleetStatus }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${STYLES[status]}`}>{status}</span>
}
