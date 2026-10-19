import { describe, expect, it } from 'vitest'
import { BAND_LABEL, BAND_STYLE, computeScore, formatScore, lateNearFirstVisit, meanScore, scoreBand, scoreDay, scoreTextClass, travelMeters } from '../effectivenessScore'
import { DEFAULT_FLAG_RULES } from '../flagRules'

const HOUR = 3_600_000
const base = { effectiveVisits: 0, ineffectiveVisits: 0, visitTarget: 10, orderedVisits: 0, totalVisits: 0, activeMs: 0, travelMeters: 0, workingMs: 9 * HOUR, lateNearFirstVisit: false }

describe('computeScore', () => {
  it('scores each part against its own goal: visits 100% of target, active time 50% of working hours, orders 25% of visits', () => {
    // 5 effective + 2 ineffective of 10 -> 55% of the 100% goal; 3 h of 9 h = 33.3% of the 50% goal = 66.7%; 1 order in 4 visits = 25% of the 25% goal = 100%
    const d = computeScore({ ...base, effectiveVisits: 5, ineffectiveVisits: 2, totalVisits: 7, orderedVisits: 2, activeMs: 3 * HOUR })
    expect(d.visitShare).toBeCloseTo(0.55, 5)
    expect(d.activeRatio).toBeCloseTo(1 / 3, 5)
    expect(d.hoursShare).toBeCloseTo(2 / 3, 5)
    expect(d.orderRatio).toBeCloseTo(2 / 7, 5)
    expect(d.orderShare).toBe(1) // 28.6% is past the 25% goal
    expect(d.score).toBe(7.4) // (0.55 + 0.6667 + 1) / 3 x 10 = 7.39
  })

  it('gives 10.0 when every goal is met, and caps each part at its goal', () => {
    expect(computeScore({ ...base, effectiveVisits: 10, totalVisits: 10, orderedVisits: 3, activeMs: 4.5 * HOUR }).score).toBe(10) // 100%, 50%, 30%
    expect(computeScore({ ...base, effectiveVisits: 30, totalVisits: 30, orderedVisits: 30, activeMs: 9 * HOUR }).score).toBe(10)
  })

  it('is 0 with nothing done, and one decimal otherwise', () => {
    expect(computeScore({ ...base }).score).toBe(0)
    // visits 40%, active 3.5/9 = 38.9% -> 77.8% of goal, orders 1 of 4 = 25% -> 100%: (0.4 + 0.7778 + 1) / 3 x 10 = 7.26
    expect(computeScore({ ...base, effectiveVisits: 4, totalVisits: 4, orderedVisits: 1, activeMs: 3.5 * HOUR }).score).toBe(7.3)
  })

  it('has no order points without orders, and none to lose without visits', () => {
    const d = computeScore({ ...base, effectiveVisits: 10, totalVisits: 10, activeMs: 4.5 * HOUR })
    expect(d.orderShare).toBe(0)
    expect(d.score).toBe(6.7) // (1 + 1 + 0) / 3
    expect(computeScore({ ...base, workingMs: 9 * HOUR }).orderShare).toBe(0)
  })

  it('adds an hour of active time for every full 50 km travelled', () => {
    const none = computeScore({ ...base, activeMs: 2 * HOUR, travelMeters: 49_000 })
    const one = computeScore({ ...base, activeMs: 2 * HOUR, travelMeters: 50_000 })
    const two = computeScore({ ...base, activeMs: 2 * HOUR, travelMeters: 120_000 })
    expect(none.travelBonusMs).toBe(0)
    expect(one.travelBonusMs).toBe(HOUR)
    expect(two.travelBonusMs).toBe(2 * HOUR)
    expect(one.activeRatio).toBeCloseTo(3 / 9, 5)
  })

  it('takes 10% off the score for a late first visit that was close by', () => {
    const inputs = { ...base, effectiveVisits: 4, totalVisits: 4, orderedVisits: 1, activeMs: 3 * HOUR }
    const plain = computeScore(inputs)
    const late = computeScore({ ...inputs, lateNearFirstVisit: true })
    expect(late.lateDeduction).toBe(true)
    expect(late.score).toBeCloseTo((plain.score as number) * 0.9, 1)
  })

  it('has no score without working time', () => {
    const d = computeScore({ ...base, workingMs: 0 })
    expect(d.score).toBeNull()
    expect(d.band).toBeNull()
  })
})

describe('scoreBand', () => {
  it('is poor under 5, average 5 up to 7, good 7 to 9, excellent above 9', () => {
    expect(scoreBand(4.9)).toBe('poor')
    expect(scoreBand(5)).toBe('average')
    expect(scoreBand(6.9)).toBe('average')
    expect(scoreBand(7)).toBe('good')
    expect(scoreBand(9)).toBe('good')
    expect(scoreBand(9.1)).toBe('excellent')
    expect(scoreBand(10)).toBe('excellent')
    expect(BAND_LABEL.poor).toBe('Poor')
    expect(BAND_LABEL.excellent).toBe('Excellent')
  })

  it('colours poor red, average amber, good blue, excellent green', () => {
    expect(BAND_STYLE.poor.text).toBe('text-status-danger')
    expect(BAND_STYLE.average.text).toBe('text-status-warn')
    expect(BAND_STYLE.good.text).toBe('text-brand-500')
    expect(BAND_STYLE.excellent.text).toBe('text-status-working')
  })

  it('picks the text colour for a score from its band', () => {
    expect(scoreTextClass(3)).toBe('text-status-danger')
    expect(scoreTextClass(6)).toBe('text-status-warn')
    expect(scoreTextClass(8)).toBe('text-brand-500')
    expect(scoreTextClass(9.5)).toBe('text-status-working')
    expect(scoreTextClass(null)).toBe('text-neutral-900')
  })
})

describe('formatScore and meanScore', () => {
  it('shows one decimal, a dash without a score', () => {
    expect(formatScore(7.8)).toBe('7.8')
    expect(formatScore(10)).toBe('10.0')
    expect(formatScore(null)).toBe('—')
  })

  it('averages the days that have a score', () => {
    expect(meanScore([8, 6, null])).toBe(7)
    expect(meanScore([null])).toBeNull()
    expect(meanScore([])).toBeNull()
  })
})

// 2026-10-14, Phnom Penh (UTC+7): 08:00 local is 01:00Z
const day = '2026-10-14'
const at = (hhmm: string) => `${day}T${hhmm}:00.000Z`
const clockIn = { clock_in_at: at('01:00'), clock_out_at: at('10:00'), clock_in_latitude: 11.5564, clock_in_longitude: 104.9282 }
const visit = (from: string, to: string, lat = 11.5564, lng = 104.9282) => ({ checked_in_at: at(from), checked_out_at: at(to), in_latitude: lat, in_longitude: lng })

describe('travelMeters', () => {
  it('adds up the straight lines through clock-in, visits and clock-out in time order', () => {
    const m = travelMeters([{ ...clockIn, clock_out_latitude: 11.5564, clock_out_longitude: 104.9282 }], [visit('02:00', '02:30', 11.5664, 104.9282)])
    expect(m).toBeGreaterThan(2000) // ~1.1 km out and back
    expect(m).toBeLessThan(2500)
  })
})

describe('lateNearFirstVisit', () => {
  it('is true for a first visit after 10:00 within 10 km of the clock-in point', () => {
    expect(lateNearFirstVisit([clockIn], [visit('04:00', '04:30')], day, '10:00')).toBe(true) // 11:00 local, same spot
  })

  it('is false when on time, far away, or a position is unknown', () => {
    expect(lateNearFirstVisit([clockIn], [visit('02:00', '02:30')], day, '10:00')).toBe(false) // 09:00 local
    expect(lateNearFirstVisit([clockIn], [visit('04:00', '04:30', 11.7, 104.9282)], day, '10:00')).toBe(false) // ~16 km away
    expect(lateNearFirstVisit([{ ...clockIn, clock_in_latitude: null }], [visit('04:00', '04:30')], day, '10:00')).toBe(false)
  })
})

describe('scoreDay', () => {
  const rule = { breakMinutes: 0, breakPaid: true, start: '08:00', end: '17:00' }
  const rules = { ...DEFAULT_FLAG_RULES, shortVisitMin: 5, visitTarget: 10 }

  it('counts effective and ineffective visits against the day target', () => {
    const visits = [visit('02:00', '02:30'), visit('03:00', '03:30'), visit('04:00', '04:02'), visit('02:40', '02:42')]
    const d = scoreDay([clockIn], visits, day, rule, 0, rules)
    expect(d.effectiveVisits).toBe(2)
    expect(d.ineffectiveVisits).toBe(2)
    expect(d.visitTarget).toBe(10)
    expect(d.visitShare).toBeCloseTo((2 + 0.5) / 10, 5)
    expect(d.workingMs).toBe(9 * HOUR)
  })

  it('scales the visit target for a half-day', () => {
    const half = { breakMinutes: 0, breakPaid: true, start: '08:30', end: '12:00' }
    const d = scoreDay([{ ...clockIn, clock_out_at: at('05:00') }], [visit('02:00', '02:30')], day, half, 0, rules)
    expect(d.visitTarget).toBe(4)
  })

  it('counts orders from the order states, or an order amount without them', () => {
    const v = (id: string, from: string, to: string, extra = {}) => ({ id, ...visit(from, to), ...extra })
    const visits = [v('a', '02:00', '02:30'), v('b', '03:00', '03:30'), v('c', '04:00', '04:30'), v('d', '05:00', '05:30')]
    const withStates = scoreDay([clockIn], visits, day, rule, 0, rules, undefined, { a: 'confirmed', b: 'pending', c: 'unmatched', d: 'none' })
    expect(withStates.orderedVisits).toBe(2)
    expect(withStates.totalVisits).toBe(4)
    expect(withStates.orderRatio).toBeCloseTo(0.5, 5)
    const byAmount = scoreDay([clockIn], [v('a', '02:00', '02:30', { order_amount_usd: 80 }), v('b', '03:00', '03:30')], day, rule, 0, rules)
    expect(byAmount.orderedVisits).toBe(1)
  })
})
