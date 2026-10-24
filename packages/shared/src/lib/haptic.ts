/**
 * Reusable haptic feedback utility.
 *
 * Wraps the Vibration API, which is all that's available to a web app (no
 * iOS Safari support, no distinction between "success" and "error" taps at
 * the OS level) -- so each type below is just a different vibration pattern.
 * Every call is a no-op on devices/browsers without support: never throws,
 * never blocks, never assumes the vibration actually happened.
 */

export type HapticType = 'light' | 'medium' | 'success' | 'warning' | 'error'

const PATTERNS: Record<HapticType, number | number[]> = {
  light: 10,
  medium: 20,
  success: [15, 40, 15],
  warning: [20, 60, 20, 60, 20],
  error: [30, 80, 30, 80, 30, 80, 30],
}

let userHasInteracted = false
if (typeof window !== 'undefined') {
  const markInteracted = () => {
    userHasInteracted = true
  }
  window.addEventListener('pointerdown', markInteracted, { once: true, capture: true })
}

/**
 * Fire a haptic pulse. Safe to call from anywhere -- on unsupported
 * browsers/devices (most desktops, iOS Safari) this is silently a no-op.
 */
export function haptic(type: HapticType): void {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return
  // Some browsers throw or ignore vibrate() before any user gesture has
  // occurred on the page; skip rather than risk a console error on load.
  if (!userHasInteracted) return
  try {
    navigator.vibrate(PATTERNS[type])
  } catch {
    // Never let a haptic failure interrupt the actual user action.
  }
}
