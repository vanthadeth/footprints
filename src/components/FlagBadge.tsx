const FLAG_LABELS: Record<string, string> = {
  UNASSIGNED_VISIT: 'Unassigned',
  LOW_LOCATION_ACCURACY: 'Low Accuracy',
  LOCATION_UNAVAILABLE: 'Location Unavailable',
  AUTO_CHECKOUT_OUTSIDE_RADIUS: 'Auto: Outside Radius',
  AUTO_CHECKOUT_CLOCK_OUT: 'Auto: Clock Out',
  TRACKING_INTERRUPTED: 'Tracking Interrupted',
}

const FLAG_TONE: Record<string, string> = {
  UNASSIGNED_VISIT: 'bg-neutral-100 text-neutral-500',
  LOW_LOCATION_ACCURACY: 'bg-status-warn/10 text-status-warn',
  LOCATION_UNAVAILABLE: 'bg-status-danger/10 text-status-danger',
  AUTO_CHECKOUT_OUTSIDE_RADIUS: 'bg-status-warn/10 text-status-warn',
  AUTO_CHECKOUT_CLOCK_OUT: 'bg-status-warn/10 text-status-warn',
  TRACKING_INTERRUPTED: 'bg-status-danger/10 text-status-danger',
}

/** Standardised flag chip (spec §49) -- same look everywhere a flag appears: Footprints, Fleet, Dashboard, Reports. */
export function FlagBadge({ flag }: { flag: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${FLAG_TONE[flag] ?? 'bg-neutral-100 text-neutral-500'}`}>
      {FLAG_LABELS[flag] ?? flag}
    </span>
  )
}
