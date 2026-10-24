import { describe, expect, it } from 'vitest'
import { gapDistanceM, geoPoints } from '../gapDistance'

const at = (hhmm: string) => `2026-10-14T${hhmm}:00+07:00`
const ms = (hhmm: string) => Date.parse(at(hhmm))
const session = { clock_in_at: at('08:00'), clock_out_at: at('17:00'), clock_in_latitude: 11.5564, clock_in_longitude: 104.9282, clock_out_latitude: 11.5564, clock_out_longitude: 104.9282 }
// ~22 km north of the clock-in point
const far = { checked_in_at: at('10:00'), checked_out_at: at('10:30'), in_latitude: 11.7564, in_longitude: 104.9282, out_latitude: 11.7564, out_longitude: 104.9282, flags: [] }
const near = { checked_in_at: at('12:00'), checked_out_at: at('12:30'), in_latitude: 11.5664, in_longitude: 104.9282, flags: [] }
const now = ms('18:00')

describe('gapDistanceM', () => {
  const pts = geoPoints([session], [far, near], now, 30)

  it('measures from the last place at the gap start to the first place at its end', () => {
    expect(gapDistanceM(pts, ms('10:30'), ms('12:00'))).toBeGreaterThan(21_000) // far visit out -> near visit in
    expect(gapDistanceM(pts, ms('10:30'), ms('12:00'))).toBeLessThan(23_000)
    expect(gapDistanceM(pts, ms('08:00'), ms('10:00'))).toBeGreaterThan(21_000) // clock-in -> far visit
  })

  it('is 0 when an end has no position, such as a gap still open', () => {
    expect(gapDistanceM(pts, ms('12:30'), ms('17:00'))).toBeLessThan(2_000) // near -> clock-out, close
    expect(gapDistanceM(geoPoints([{ ...session, clock_out_at: null }], [near], now, 30), ms('12:30'), now)).toBe(0)
    expect(gapDistanceM([], ms('10:00'), ms('11:00'))).toBe(0)
  })

  it('skips cancelled visits and uses the capped end of a forgotten visit', () => {
    expect(geoPoints([], [{ ...far, cancelled_at: at('10:05') }], now, 30)).toEqual([])
    const forgotten = { ...far, checked_out_at: at('16:00'), flags: ['AUTO_CHECKOUT_CLOCK_OUT'] }
    const p = geoPoints([], [forgotten], now, 30)
    expect(p[1].t).toBe(ms('10:30'))
  })
})
