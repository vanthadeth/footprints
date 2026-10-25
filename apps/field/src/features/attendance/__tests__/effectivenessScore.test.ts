import { describe, expect, it } from 'vitest'
import { BAND_LABEL, BAND_STYLE, computeScore, formatScore, inputsOf, lateFirstVisit, meanScore, nextBand, nextSteps, orderSummary, orderValueUsd, scoreBand, scoreDay, scoreTextClass, travelDeductionMs, travelMeters } from '../effectivenessScore'
import { DEFAULT_FLAG_RULES } from '../flagRules'

const HOUR = 3_600_000
const base = { effectiveVisits: 0, ineffectiveVisits: 0, visitTarget: 10, orderedVisits: 0, totalVisits: 0, orderValueUsd: 0, orderTargetUsd: 300, activeMs: 0, travelMeters: 0, travelDeductionMs: 0, workingMs: 9 * HOUR, lateFirstVisit: false }

describe('computeScore', () => {
  it('scores each part against its own goal: visits 100% of target, active time 50% of working hours, orders 100% of the order target', () => {
    // 5 effective + 2 ineffective of 10 -> 55%; 3 h of 9 h = 33.3% of the 50% goal = 66.7%; $186 of the $300 order target = 62%
    const d = computeScore({ ...base, effectiveVisits: 5, ineffectiveVisits: 2, totalVisits: 7, orderedVisits: 2, orderValueUsd: 186, activeMs: 3 * HOUR })
    expect(d.visitShare).toBeCloseTo(0.55, 5)
    expect(d.activeRatio).toBeCloseTo(1 / 3, 5)
    expect(d.hoursShare).toBeCloseTo(2 / 3, 5)
    expect(d.orderRatio).toBeCloseTo(2 / 7, 5) // shown, no longer scored
    expect(d.orderShare).toBeCloseTo(0.62, 5)
    expect(d.score).toBe(6.1) // (0.55 + 0.6667 + 0.62) / 3 x 10 = 6.12
  })

  it('gives 10.0 when every goal is met, and caps each part at its goal', () => {
    expect(computeScore({ ...base, effectiveVisits: 10, totalVisits: 10, orderedVisits: 3, orderValueUsd: 300, activeMs: 4.5 * HOUR }).score).toBe(10)
    expect(computeScore({ ...base, effectiveVisits: 30, totalVisits: 30, orderedVisits: 30, orderValueUsd: 5000, activeMs: 9 * HOUR }).score).toBe(10)
  })

  it('is 0 with nothing done, and one decimal otherwise', () => {
    expect(computeScore({ ...base }).score).toBe(0)
    // visits 40%, active 3.5/9 = 38.9% -> 77.8% of goal, orders $150 of $300 = 50%: (0.4 + 0.7778 + 0.5) / 3 x 10 = 5.59
    expect(computeScore({ ...base, effectiveVisits: 4, totalVisits: 4, orderedVisits: 1, orderValueUsd: 150, activeMs: 3.5 * HOUR }).score).toBe(5.6)
  })

  it('has no order points without orders, and one big order counts more than many visits to one small one', () => {
    const none = computeScore({ ...base, effectiveVisits: 10, totalVisits: 10, activeMs: 4.5 * HOUR })
    expect(none.orderShare).toBe(0)
    expect(none.score).toBe(6.7) // (1 + 1 + 0) / 3
    const small = computeScore({ ...base, effectiveVisits: 1, totalVisits: 1, orderedVisits: 1, orderValueUsd: 30 })
    const big = computeScore({ ...base, effectiveVisits: 1, totalVisits: 1, orderedVisits: 1, orderValueUsd: 300 })
    expect(big.orderShare).toBe(1)
    expect(small.orderShare).toBeCloseTo(0.1, 5)
  })

  it('leaves the orders part out when the person has no order target', () => {
    const d = computeScore({ ...base, effectiveVisits: 10, totalVisits: 10, activeMs: 4.5 * HOUR, orderTargetUsd: 0, orderValueUsd: 0 })
    expect(d.score).toBe(10) // (1 + 1) / 2
  })

  it('measures active time against working hours less the long-travel deduction', () => {
    const none = computeScore({ ...base, activeMs: 2 * HOUR })
    const cut = computeScore({ ...base, activeMs: 2 * HOUR, travelDeductionMs: 3 * HOUR })
    expect(none.travelDeductionMs).toBe(0)
    expect(cut.travelDeductionMs).toBe(3 * HOUR)
    expect(none.activeRatio).toBeCloseTo(2 / 9, 5)
    expect(cut.activeRatio).toBeCloseTo(2 / 6, 5)
    // The deduction can't take more than the working time itself
    expect(computeScore({ ...base, activeMs: HOUR, travelDeductionMs: 20 * HOUR }).activeRatio).toBe(1)
  })

  it('takes 10% off the score for a late first visit', () => {
    const inputs = { ...base, effectiveVisits: 4, totalVisits: 4, orderedVisits: 1, activeMs: 3 * HOUR }
    const plain = computeScore(inputs)
    const late = computeScore({ ...inputs, lateFirstVisit: true })
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

describe('lateFirstVisit', () => {
  const rules = { firstVisitDeadline: '10:00', firstVisitFar: { enabled: true, km: 10, extraMin: 30 } }

  it('is true for a first visit after the deadline close to the clock-in point', () => {
    expect(lateFirstVisit([clockIn], [visit('04:00', '04:30')], day, rules)).toBe(true) // 11:00 local, same spot
    expect(lateFirstVisit([clockIn], [visit('03:10', '03:30')], day, rules)).toBe(true) // 10:10, close by: no extra time
  })

  it('is false when on time', () => {
    expect(lateFirstVisit([clockIn], [visit('02:00', '02:30')], day, rules)).toBe(false) // 09:00 local
    expect(lateFirstVisit([clockIn], [], day, rules)).toBe(false)
  })

  it('gives 30 more minutes when the first stop is more than 10 km from the clock-in point', () => {
    expect(lateFirstVisit([clockIn], [visit('03:20', '03:50', 11.7, 104.9282)], day, rules)).toBe(false) // ~16 km away, 10:20 local
    expect(lateFirstVisit([clockIn], [visit('03:40', '04:10', 11.7, 104.9282)], day, rules)).toBe(true) // 10:40, past 10:30
    expect(lateFirstVisit([clockIn], [visit('03:20', '03:50', 11.7, 104.9282)], day, { ...rules, firstVisitFar: { ...rules.firstVisitFar, enabled: false } })).toBe(true)
  })

  it('keeps the plain deadline when a position is unknown', () => {
    expect(lateFirstVisit([{ ...clockIn, clock_in_latitude: null }], [visit('03:20', '03:50', 11.7, 104.9282)], day, rules)).toBe(true)
  })
})

describe('travelDeductionMs', () => {
  const rule = { enabled: true, minKm: 25, stepKm: 10, minutes: 10, homeLat: 11.5564, homeLng: 104.9282, homeRadiusKm: 15 }
  const out = [visit('02:00', '02:30', 11.9, 104.9282)] // ~38 km north of the centre: outside Phnom Penh
  const inside = [visit('02:00', '02:30')]

  it('takes 10 minutes for every full 10 km once the day travels more than 25 km, with a visit outside Phnom Penh', () => {
    expect(travelDeductionMs(25_000, out, rule)).toBe(0) // not over 25 km
    expect(travelDeductionMs(26_000, out, rule)).toBe(2 * 10 * 60_000)
    expect(travelDeductionMs(59_999, out, rule)).toBe(5 * 10 * 60_000)
    expect(travelDeductionMs(100_000, out, rule)).toBe(10 * 10 * 60_000)
  })

  it('does nothing when every visit is inside Phnom Penh, or when it is switched off', () => {
    expect(travelDeductionMs(60_000, inside, rule)).toBe(0)
    expect(travelDeductionMs(60_000, out, { ...rule, enabled: false })).toBe(0)
    expect(travelDeductionMs(60_000, out, undefined)).toBe(0)
  })

  it('ignores a cancelled visit outside the city', () => {
    expect(travelDeductionMs(60_000, [{ ...out[0], cancelled_at: at('03:00') }], rule)).toBe(0)
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

describe('scoreDay: a late clock-in counts the full working hours', () => {
  const HOURS = 3_600_000
  const rule = { breakMinutes: 0, breakPaid: true, start: '08:00', end: '17:00' }
  const rules = { ...DEFAULT_FLAG_RULES, lateGraceMin: 5 }
  const after = Date.parse(`${day}T11:00:00.000Z`) // 18:00 local, the day is over
  const session = (inHm: string, outHm: string) => ({ clock_in_at: at(inHm), clock_out_at: at(outHm) })
  const v = [visit('03:00', '03:40')]

  it('measures a person who clocked in an hour late against the whole 9 hours, not the 8 they were in', () => {
    const d = scoreDay([session('02:00', '10:00')], v, day, rule, after, rules) // in 09:00, out 17:00 local
    expect(d.lateFullHours).toBe(true)
    expect(d.workingMs).toBe(9 * HOURS)
  })

  it('leaves an on-time clock-in, or one inside the grace period, as it was', () => {
    const onTime = scoreDay([session('01:00', '10:00')], v, day, rule, after, rules)
    expect(onTime.lateFullHours).toBe(false)
    expect(onTime.workingMs).toBe(9 * HOURS)
    const grace = scoreDay([session('01:04', '10:00')], v, day, rule, after, rules) // 08:04, within the 5 min
    expect(grace.lateFullHours).toBe(false)
    expect(grace.workingMs).toBeGreaterThan(8.9 * HOURS)
    expect(grace.workingMs).toBeLessThan(9 * HOURS)
  })

  it('does not apply with approved leave that day (half or full)', () => {
    const half = scoreDay([session('02:00', '10:00')], v, day, rule, after, rules, undefined, undefined, { leaveFraction: 0.5 })
    expect(half.lateFullHours).toBe(false)
    expect(half.workingMs).toBe(8 * HOURS)
  })

  it('uses the schedule so far while the day is still running', () => {
    const now = Date.parse(`${day}T03:00:00.000Z`) // 10:00 local
    const d = scoreDay([{ clock_in_at: at('02:30'), clock_out_at: null }], [], day, rule, now, rules) // in 09:30
    expect(d.lateFullHours).toBe(true)
    expect(d.workingMs).toBe(2 * HOURS) // 08:00 to 10:00
  })

  it('takes the server\'s word for late, and the person\'s own unpaid break for the full hours', () => {
    const zeroBreak = { breakMinutes: 0, breakPaid: true, start: '08:00', end: '17:00' }
    const d = scoreDay([session('02:00', '10:00')], v, day, zeroBreak, after, { ...rules, lateGraceMin: 600 }, 7 * HOURS, undefined, { late: true, breakRule: { breakMinutes: 60, breakPaid: false } })
    expect(d.lateFullHours).toBe(true)
    expect(d.workingMs).toBe(8 * HOURS) // 9 h day less the 1 h unpaid break
  })

  it('has no effect without the person\'s hours', () => {
    const d = scoreDay([session('02:00', '10:00')], v, day, null, after, rules)
    expect(d.lateFullHours).toBe(false)
  })
})

describe('orderValueUsd', () => {
  const v = (id: string, amount: number | null, extra: Record<string, unknown> = {}) => ({ id, checked_in_at: at('02:00'), checked_out_at: at('02:30'), order_amount_usd: amount, ...extra })

  it('adds up the visits that count as ordered, by the amount the person entered', () => {
    expect(orderValueUsd([v('a', 120), v('b', null), v('c', 30)], undefined, undefined)).toBe(150)
  })

  it('uses a synced sale order total in place of the entered amount, once per order number', () => {
    const totals = { a: { orderNo: 'SO-1', totalUsd: 500 }, b: { orderNo: 'SO-1', totalUsd: 500 }, c: { orderNo: 'SO-2', totalUsd: null } }
    // a and b matched the same order; c matched one with no total, so the entered amount stands
    expect(orderValueUsd([v('a', 120), v('b', 80), v('c', 40)], undefined, totals)).toBe(540)
  })

  it('leaves out cancelled visits and orders that no longer count (unmatched)', () => {
    const states = { a: 'confirmed', b: 'unmatched', c: 'pending' } as const
    expect(orderValueUsd([v('a', 100), v('b', 100), v('c', 50, { cancelled_at: at('03:00') })], states, undefined)).toBe(100)
  })

  it('counts the orders the same way: a synced order once, entered ones one each', () => {
    const totals = { a: { orderNo: 'SO-1', totalUsd: 500 }, b: { orderNo: 'SO-1', totalUsd: 500 } }
    expect(orderSummary([v('a', 120), v('b', 80), v('c', 40), v('d', null)], undefined, totals)).toEqual({ count: 2, valueUsd: 540 })
    expect(orderSummary([], undefined, undefined)).toEqual({ count: 0, valueUsd: 0 })
  })
})

describe('scoreDay: orders by value', () => {
  const rule = { breakMinutes: 0, breakPaid: true, start: '08:00', end: '17:00' }
  const rules = { ...DEFAULT_FLAG_RULES, orderTargetUsd: 300, fullDayHours: 9 }
  const visits = [{ ...visit('02:00', '02:40'), id: 'v1', order_amount_usd: 150 }]

  it("measures the day's order value against the person's own target, falling back to the company's", () => {
    const own = scoreDay([clockIn], visits, day, rule, 0, rules, undefined, undefined, { orderTargetUsd: 600 })
    expect(own.orderTargetUsd).toBe(600)
    expect(own.orderValueUsd).toBe(150)
    expect(own.orderShare).toBeCloseTo(0.25, 5)
    const company = scoreDay([clockIn], visits, day, rule, 0, rules)
    expect(company.orderTargetUsd).toBe(300)
    expect(company.orderShare).toBeCloseTo(0.5, 5)
  })

  it("scales the target by the day's scheduled hours", () => {
    const half = scoreDay([clockIn], visits, day, { ...rule, end: '12:30' }, 0, rules, undefined, undefined, { orderTargetUsd: 600 }) // 4.5 of 9 h
    expect(half.orderTargetUsd).toBe(300)
  })
})

describe('nextBand and nextSteps', () => {
  it('names the next band and the score that reaches it', () => {
    expect(nextBand(4.1)).toEqual({ band: 'average', at: 5 })
    expect(nextBand(6.9)).toEqual({ band: 'good', at: 7 })
    expect(nextBand(8.2)).toEqual({ band: 'excellent', at: 9.1 })
    expect(nextBand(9.5)).toBeNull()
  })

  const day4 = { ...base, effectiveVisits: 4, totalVisits: 4, orderedVisits: 0, activeMs: 2 * HOUR }

  it('suggests the fewest extra visits and extra orders that reach the next band', () => {
    const now = computeScore(day4).score as number
    const r = nextSteps(day4)
    expect(r.next?.band).toBe(nextBand(now)?.band)
    const visit = r.steps.find((s) => s.kind === 'visit')
    const order = r.steps.find((s) => s.kind === 'order')
    expect(visit && visit.score).toBeGreaterThan(now)
    expect(order && order.orderUsd).toBe(100) // a quarter of the $300 target, to the nearest $50
    for (const s of r.steps) if (s.reaches) expect(s.score).toBeGreaterThanOrEqual(r.next!.at)
  })

  it('has nothing to suggest at the top band, without a score, or for orders without a target', () => {
    expect(nextSteps({ ...base, effectiveVisits: 10, totalVisits: 10, orderedVisits: 3, orderValueUsd: 300, activeMs: 4.5 * HOUR }).steps).toEqual([])
    expect(nextSteps({ ...base, workingMs: 0 }).steps).toEqual([])
    expect(nextSteps({ ...day4, orderTargetUsd: 0 }).steps.every((s) => s.kind === 'visit')).toBe(true)
  })

  it('rebuilds a day score\'s inputs so the suggestions match what was shown', () => {
    const d = computeScore({ ...day4, lateFirstVisit: true })
    expect(computeScore(inputsOf(d)).score).toBe(d.score)
  })
})
