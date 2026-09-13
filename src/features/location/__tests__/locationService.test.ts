import { afterEach, describe, expect, it, vi } from 'vitest'
import { locationService } from '../locationService'
import { LocationError } from '../types'
import { MAX_ACCEPTABLE_LOCATION_ACCURACY_METERS } from '@/lib/config'

function mockGeolocation(impl: (success: PositionCallback, error?: PositionErrorCallback) => void) {
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: { getCurrentPosition: impl, watchPosition: vi.fn(), clearWatch: vi.fn() },
  })
}

function fakePosition(accuracy: number): GeolocationPosition {
  return {
    coords: { latitude: 11.5564, longitude: 104.9282, accuracy, altitude: null, altitudeAccuracy: null, heading: null, speed: null },
    timestamp: Date.now(),
  } as GeolocationPosition
}

describe('locationService.getCurrentPosition', () => {
  afterEach(() => {
    // @ts-expect-error -- test cleanup
    delete navigator.geolocation
  })

  it('classifies a reading within the accuracy threshold as accurate', async () => {
    mockGeolocation((success) => success(fakePosition(MAX_ACCEPTABLE_LOCATION_ACCURACY_METERS - 1)))
    const reading = await locationService.getCurrentPosition()
    expect(reading.status).toBe('accurate')
  })

  it('classifies a reading beyond the accuracy threshold as low_accuracy, never rejecting it (spec §45)', async () => {
    mockGeolocation((success) => success(fakePosition(MAX_ACCEPTABLE_LOCATION_ACCURACY_METERS + 50)))
    const reading = await locationService.getCurrentPosition()
    expect(reading.status).toBe('low_accuracy')
    // A low-accuracy reading is still a real reading -- it's flagged, not discarded.
    expect(reading.latitude).toBeCloseTo(11.5564)
  })

  it('rejects with a permission_denied LocationError, never fabricating a location', async () => {
    mockGeolocation((_success, error) => error?.({ code: 1, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError))
    await expect(locationService.getCurrentPosition()).rejects.toBeInstanceOf(LocationError)
    await expect(locationService.getCurrentPosition()).rejects.toMatchObject({ status: 'permission_denied' })
  })

  it('rejects with an unavailable LocationError on any other geolocation failure', async () => {
    mockGeolocation((_success, error) => error?.({ code: 2, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError))
    await expect(locationService.getCurrentPosition()).rejects.toMatchObject({ status: 'unavailable' })
  })

  it('rejects immediately when geolocation is unsupported, without touching navigator.geolocation', async () => {
    // @ts-expect-error -- simulate an environment with no geolocation API at all
    delete navigator.geolocation
    await expect(locationService.getCurrentPosition()).rejects.toMatchObject({ status: 'unavailable' })
  })
})
