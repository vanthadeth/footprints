import { describe, expect, it } from 'vitest'
import { directionsUrl, etaMinutes, nearestNeighbourOrder, routeDistance } from '../planRoute'

// Three shops strung out east of the start along the same latitude, given out of order.
const start = { lat: 11.55, lng: 104.9 }
const near = { id: 'near', lat: 11.55, lng: 104.91 }
const mid = { id: 'mid', lat: 11.55, lng: 104.93 }
const far = { id: 'far', lat: 11.55, lng: 104.96 }

describe('nearestNeighbourOrder', () => {
  it('visits the closest stop first, then the closest from there', () => {
    expect(nearestNeighbourOrder(start, [far, near, mid]).map((s) => s.id)).toEqual(['near', 'mid', 'far'])
  })

  it('keeps the given first stop when there is no start fix', () => {
    expect(nearestNeighbourOrder(null, [mid, far, near]).map((s) => s.id)).toEqual(['mid', 'near', 'far'])
  })

  it('handles an empty list', () => {
    expect(nearestNeighbourOrder(start, [])).toEqual([])
  })
})

describe('routeDistance', () => {
  it('sums the legs, which the nearest-neighbour order shortens', () => {
    const ordered = routeDistance(start, [near, mid, far])
    const zigzag = routeDistance(start, [far, near, mid])
    expect(ordered).toBeGreaterThan(6000)
    expect(ordered).toBeLessThan(7000)
    expect(zigzag).toBeGreaterThan(ordered)
  })

  it('is 0 with nothing left to visit', () => {
    expect(routeDistance(start, [])).toBe(0)
  })
})

describe('etaMinutes / directionsUrl', () => {
  it('estimates at least a minute', () => {
    expect(etaMinutes(0)).toBe(1)
    expect(etaMinutes(10_000)).toBe(39)
  })

  it('builds a Google Maps driving link', () => {
    expect(directionsUrl(11.5, 104.9)).toBe('https://www.google.com/maps/dir/?api=1&destination=11.5,104.9&travelmode=driving')
  })
})
