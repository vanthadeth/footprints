import { MAX_ACCEPTABLE_LOCATION_ACCURACY_METERS } from '@/lib/config'
import { distanceInMeters } from '@/lib/geo'
import { LocationError, type LocationReading } from './types'

/** A reading older than this is never presented as "current". */
const STALE_AFTER_MS = 2 * 60 * 1000

/**
 * All GPS access goes through here. Components must never call
 * navigator.geolocation directly -- this is the one place that decides
 * accuracy thresholds, staleness, and error classification, so every
 * screen behaves consistently and every business rule (65: never trust
 * the client clock, 45: distinguish accurate/low-accuracy/unavailable)
 * stays enforced in one spot.
 */
export const locationService = {
  isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'geolocation' in navigator
  },

  /** Resolves the current permission state where the Permissions API exists. */
  async getPermissionState(): Promise<PermissionState | 'unsupported'> {
    if (typeof navigator === 'undefined' || !('permissions' in navigator)) return 'unsupported'
    try {
      const status = await navigator.permissions.query({ name: 'geolocation' as PermissionName })
      return status.state
    } catch {
      return 'unsupported'
    }
  },

  /**
   * Get a single current position. Never silently fabricates a location:
   * on denial or unavailability this throws a LocationError the caller
   * must handle (never create a false location record -- rule #44).
   */
  getCurrentPosition(options?: PositionOptions): Promise<LocationReading> {
    if (!this.isSupported()) {
      return Promise.reject(new LocationError('Geolocation is not supported on this device.', 'unavailable'))
    }

    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const accuracy = position.coords.accuracy
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy,
            timestamp: position.timestamp,
            status: accuracy > MAX_ACCEPTABLE_LOCATION_ACCURACY_METERS ? 'low_accuracy' : 'accurate',
          })
        },
        (error) => {
          if (error.code === error.PERMISSION_DENIED) {
            reject(new LocationError('Location permission was denied.', 'permission_denied'))
          } else {
            reject(new LocationError('Location is currently unavailable.', 'unavailable'))
          }
        },
        {
          enableHighAccuracy: true,
          timeout: 15_000,
          maximumAge: 0,
          ...options,
        }
      )
    })
  },

  /** Watch position continuously; returns an unsubscribe function. */
  watchPosition(
    onReading: (reading: LocationReading) => void,
    onError: (error: LocationError) => void,
    options?: PositionOptions
  ): () => void {
    if (!this.isSupported()) {
      onError(new LocationError('Geolocation is not supported on this device.', 'unavailable'))
      return () => {}
    }

    const id = navigator.geolocation.watchPosition(
      (position) => {
        const accuracy = position.coords.accuracy
        onReading({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy,
          timestamp: position.timestamp,
          status: accuracy > MAX_ACCEPTABLE_LOCATION_ACCURACY_METERS ? 'low_accuracy' : 'accurate',
        })
      },
      (error) => {
        onError(
          error.code === error.PERMISSION_DENIED
            ? new LocationError('Location permission was denied.', 'permission_denied')
            : new LocationError('Location is currently unavailable.', 'unavailable')
        )
      },
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 20_000, ...options }
    )

    return () => navigator.geolocation.clearWatch(id)
  },

  isStale(reading: Pick<LocationReading, 'timestamp'>): boolean {
    return Date.now() - reading.timestamp > STALE_AFTER_MS
  },

  distanceInMeters,
}
