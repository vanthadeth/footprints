const FLAG_LABELS: Record<string, string> = {
  UNASSIGNED_VISIT: 'Unassigned',
  LOW_LOCATION_ACCURACY: 'Low Accuracy',
  LOCATION_UNAVAILABLE: 'Location Unavailable',
  AUTO_CHECKOUT_OUTSIDE_RADIUS: 'Auto: Outside Radius',
  AUTO_CHECKOUT_CLOCK_OUT: 'Auto: Clock Out',
  AUTO_CHECKOUT_WORKING_HOURS_END: 'Auto: End of Day',
  SHORT_VISIT: 'Short Visit',
  LATE_FIRST_VISIT: 'Late First Visit',
  TRACKING_INTERRUPTED: 'Tracking Interrupted',
  EARLY_CLOCK_OUT: 'Early Clock-Out',
}

const FLAG_TONE: Record<string, string> = {
  UNASSIGNED_VISIT: 'bg-neutral-100 text-neutral-500',
  LOW_LOCATION_ACCURACY: 'bg-status-warn/10 text-status-warn',
  LOCATION_UNAVAILABLE: 'bg-status-danger/10 text-status-danger',
  AUTO_CHECKOUT_OUTSIDE_RADIUS: 'bg-status-warn/10 text-status-warn',
  AUTO_CHECKOUT_CLOCK_OUT: 'bg-status-warn/10 text-status-warn',
  AUTO_CHECKOUT_WORKING_HOURS_END: 'bg-status-warn/10 text-status-warn',
  SHORT_VISIT: 'bg-neutral-100 text-neutral-500',
  LATE_FIRST_VISIT: 'bg-status-warn/10 text-status-warn',
  TRACKING_INTERRUPTED: 'bg-status-danger/10 text-status-danger',
  EARLY_CLOCK_OUT: 'bg-status-warn/10 text-status-warn',
}

/** Standardised flag chip (spec §49) -- same look everywhere a flag appears: Footprints, Fleet, Dashboard, Reports. */
export function FlagBadge({ flag }: { flag: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${FLAG_TONE[flag] ?? 'bg-neutral-100 text-neutral-500'}`}>
      {FLAG_LABELS[flag] ?? flag}
    </span>
  )
}
