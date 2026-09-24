/** Share of the travel distance the knob must reach before a release counts as "confirmed". */
export const SLIDE_CONFIRM_THRESHOLD = 0.85

/** Knob progress 0-1 for a drag of `dx` px along a track, given the track and knob widths (and the track's inner padding). */
export function slideProgress(dx: number, trackWidth: number, knobWidth: number, padding = 4): number {
  const travel = trackWidth - knobWidth - padding * 2
  if (travel <= 0) return 0
  return Math.min(1, Math.max(0, dx / travel))
}

export function isSlideConfirmed(progress: number): boolean {
  return progress >= SLIDE_CONFIRM_THRESHOLD
}
