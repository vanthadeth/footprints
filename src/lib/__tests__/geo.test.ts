import { describe, expect, it } from 'vitest'
import { distanceInMeters, formatDistance } from '../geo'

describe('distanceInMeters', () => {
  it('is zero for identical coordinates', () => {
    expect(distanceInMeters(11.5564, 104.9282, 11.5564, 104.9282)).toBeCloseTo(0, 1)
  })

  it('is never computed by naively subtracting lat/lng (spec §58)', () => {
    // A crude subtraction would give a "distance" of 0.01 degrees; the real
    // Haversine distance is on the order of hundreds of meters, not degrees.
    const naive = Math.abs(11.5564 - 11.5654)
    const real = distanceInMeters(11.5564, 104.9282, 11.5654, 104.9282)
    expect(real).toBeGreaterThan(500)
    expect(real).not.toBeCloseTo(naive, 0)
  })

  it('matches a known reference distance to within a few meters', () => {
    // Phnom Penh (Independence Monument) to a point ~1.11km due north.
    const d = distanceInMeters(11.5564, 104.9282, 11.5664, 104.9282)
    expect(d).toBeGreaterThan(1080)
    expect(d).toBeLessThan(1120)
  })
})

describe('formatDistance', () => {
  it('renders sub-km distances in metres', () => {
    expect(formatDistance(320)).toBe('320 m')
  })

  it('renders 1km+ distances in km with one decimal', () => {
    expect(formatDistance(1234)).toBe('1.2 km')
  })

  it('renders an em dash for missing distance', () => {
    expect(formatDistance(null)).toBe('—')
    expect(formatDistance(undefined)).toBe('—')
  })
})
