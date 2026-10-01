import type { TripStatus } from './tripService'

/** Shared class strings and status labels for the trip screens. */
export const kicker = 'text-[12px] font-extrabold uppercase tracking-wide text-neutral-500'
export const card = 'rounded-2xl bg-white shadow-card'

export const STATUS: Record<TripStatus, { label: string; tone: string }> = {
  pending: { label: 'Waiting for approval', tone: 'bg-status-warn/10 text-status-warn' },
  approved: { label: 'Approved', tone: 'bg-status-working/10 text-status-working dark:text-emerald-300' },
  changes: { label: 'Changes asked', tone: 'bg-status-warn/10 text-status-warn' },
  rejected: { label: 'Rejected', tone: 'bg-status-danger/10 text-status-danger' },
  cancelled: { label: 'Cancelled', tone: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800' },
}
