export type LocationStatus = 'accurate' | 'low_accuracy' | 'unavailable' | 'permission_denied' | 'stale'

export interface LocationReading {
  latitude: number
  longitude: number
  /** Meters, per the browser's own accuracy estimate (always present per the Geolocation spec). */
  accuracy: number
  timestamp: number
  status: LocationStatus
}

export class LocationError extends Error {
  constructor(
    message: string,
    public status: Extract<LocationStatus, 'unavailable' | 'permission_denied'>
  ) {
    super(message)
    this.name = 'LocationError'
  }
}
