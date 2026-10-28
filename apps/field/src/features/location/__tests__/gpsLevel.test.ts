import { describe, expect, it } from 'vitest'
import { gpsLevel } from '../gpsLevel'

describe('gpsLevel', () => {
  it('maps the canvas samples', () => {
    expect(gpsLevel(12)).toBe('good')
    expect(gpsLevel(60)).toBe('good')
    expect(gpsLevel(240)).toBe('moderate')
    expect(gpsLevel(480)).toBe('low')
    expect(gpsLevel(1200)).toBe('tooLow')
  })
  it('puts the edges in the better step', () => {
    expect(gpsLevel(100)).toBe('good')
    expect(gpsLevel(300)).toBe('moderate')
    expect(gpsLevel(600)).toBe('low')
    expect(gpsLevel(601)).toBe('tooLow')
  })
})
