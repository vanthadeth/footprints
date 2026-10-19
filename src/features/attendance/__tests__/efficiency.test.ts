import { describe, expect, it } from 'vitest'
import { creditedVisitMs, dayEffectiveness, outsideScheduleMs, paidWorkMs, scaledDailyTarget, uniqueCustomerTarget } from '../efficiency'
import { DEFAULT_FLAG_RULES } from '../flagRules'

const at = (hhmm: string) => `2026-10-14T${hhmm}:00.000Z`
const HOUR = 3_600_000
const unpaid30 = { breakMinutes: 30, breakPaid: false }

describe('paidWorkMs', () => {
  it('is time clocked in when there is no rule', () => {
    expect(paidWorkMs([{ clock_in_at: at('01:00'), clock_out_at: at('09:00') }], 0)).toBe(8 * HOUR)
  })

  it('takes the unpaid break off a long enough day', () => {
    expect(paidWorkMs([{ clock_in_at: at('01:00'), clock_out_at: at('09:00') }], 0, unpaid30)).toBe(7.5 * HOUR)
  })

  it('leaves a short day alone (under break + 1 hour)', () => {
    expect(paidWorkMs([{ clock_in_at: at('01:00'), clock_out_at: at('02:20') }], 0, unpaid30)).toBe(80 * 60_000)
    expect(paidWorkMs([{ clock_in_at: at('01:00'), clock_out_at: at('02:30') }], 0, unpaid30)).toBe(60 * 60_000)
  })

  it('does not take a paid break off', () => {
    expect(paidWorkMs([{ clock_in_at: at('01:00'), clock_out_at: at('09:00') }], 0, { breakMinutes: 30, breakPaid: true })).toBe(8 * HOUR)
  })

  it('counts time off the clock between sessions toward the break first', () => {
    // 01:00-05:00 and 06:00-10:00: 8 h clocked, 1 h out for lunch -> the 30 min break is already taken.
    const sessions = [
      { clock_in_at: at('01:00'), clock_out_at: at('05:00') },
      { clock_in_at: at('06:00'), clock_out_at: at('10:00') },
    ]
    expect(paidWorkMs(sessions, 0, unpaid30)).toBe(8 * HOUR)
    // 15 min out only: the other 15 min of the break still comes off.
    const short = [
      { clock_in_at: at('01:00'), clock_out_at: at('05:00') },
      { clock_in_at: at('05:15'), clock_out_at: at('09:15') },
    ]
    expect(paidWorkMs(short, 0, unpaid30)).toBe(8 * HOUR - 15 * 60_000)
  })

  it('runs an open session to now, but never past 16 hours', () => {
    const open = [{ clock_in_at: at('01:00'), clock_out_at: null }]
    expect(paidWorkMs(open, new Date(at('03:00')).getTime())).toBe(2 * HOUR)
    expect(paidWorkMs(open, new Date('2026-10-20T00:00:00.000Z').getTime())).toBe(16 * HOUR)
  })

  it('is zero with no sessions', () => {
    expect(paidWorkMs([], 0, unpaid30)).toBe(0)
  })
})

const rulesShort5 = { ...DEFAULT_FLAG_RULES, shortVisitMin: 5, visitCreditCapMin: 45 }
const MIN = 60_000
const visit = (from: string, to: string | null, extra: object = {}) => ({ checked_in_at: at(from), checked_out_at: to ? at(to) : null, ...extra })
// 08:00-17:00 local (UTC+7) on 2026-10-14
const shift = { breakMinutes: 30, breakPaid: false, start: '08:00', end: '17:00' }

describe('creditedVisitMs', () => {
  it('counts nothing for a completed visit under the short-visit limit, everything from the limit up', () => {
    expect(creditedVisitMs(visit('02:00', '02:04'), 0, rulesShort5)).toBe(0)
    expect(creditedVisitMs(visit('02:00', '02:05'), 0, rulesShort5)).toBe(5 * MIN)
  })

  it('credits a long visit up to the cap only', () => {
    expect(creditedVisitMs(visit('02:00', '03:30'), 0, rulesShort5)).toBe(45 * MIN)
    expect(creditedVisitMs(visit('02:00', '02:40'), 0, rulesShort5)).toBe(40 * MIN)
  })

  it('credits a visit still in progress as it runs, never zero', () => {
    expect(creditedVisitMs(visit('02:00', null), new Date(at('02:01')).getTime(), rulesShort5)).toBe(MIN)
    expect(creditedVisitMs(visit('02:00', null), new Date(at('05:00')).getTime(), rulesShort5)).toBe(45 * MIN)
  })

  it('counts a forgotten check-out at its cap', () => {
    const forgotten = visit('02:00', '06:00', { flags: ['AUTO_CHECKOUT_CLOCK_OUT'] })
    expect(creditedVisitMs(forgotten, 0, { ...rulesShort5, forgottenCapMin: 30 })).toBe(30 * MIN)
  })
})

describe('outsideScheduleMs', () => {
  const ms = (hhmm: string) => new Date(at(hhmm)).getTime()
  const day = '2026-10-14'

  it('is the time clocked in before the start and after the end', () => {
    // in 05:30 local (22:30Z the day before), out 19:00 local (12:00Z): 2.5 h early, 2 h late.
    expect(outsideScheduleMs(new Date('2026-10-13T22:30:00.000Z').getTime(), ms('12:00'), day, shift, [])).toBe(4.5 * HOUR)
  })

  it('is zero inside the hours, and without known hours', () => {
    expect(outsideScheduleMs(ms('01:00'), ms('10:00'), day, shift, [])).toBe(0)
    expect(outsideScheduleMs(ms('00:00'), ms('13:00'), day, { start: undefined, end: undefined }, [])).toBe(0)
    expect(outsideScheduleMs(ms('00:00'), ms('13:00'), day, null, [])).toBe(0)
  })

  it('keeps time where a visit happened (the hours widen to take it in)', () => {
    // out at 19:00 local, last visit ran to 18:30 local: only the 30 min after it is outside.
    expect(outsideScheduleMs(ms('01:00'), ms('12:00'), day, shift, [[ms('11:00'), ms('11:30')]])).toBe(30 * MIN)
  })
})

describe('dayEffectiveness', () => {
  it('does not lower the ratio for clocking in early and out late', () => {
    const early = [{ clock_in_at: '2026-10-13T22:30:00.000Z', clock_out_at: at('12:00') }] // 05:30-19:00 local
    const visits = [visit('02:00', '03:00'), visit('04:00', '05:00')] // 2 h of visits
    const wide = dayEffectiveness(early, visits, '2026-10-14', shift, 0, rulesShort5)
    const normal = dayEffectiveness([{ clock_in_at: at('01:00'), clock_out_at: at('10:00') }], visits, '2026-10-14', shift, 0, rulesShort5)
    expect(wide.creditedMs / wide.scheduledPaidMs).toBeCloseTo(normal.creditedMs / normal.scheduledPaidMs, 1)
    // 13.5 h clocked less 4.5 h outside = 9 h, less the 30 min break.
    expect(wide.scheduledPaidMs).toBe(8.5 * HOUR)
  })

  it('does not credit drive-by visits', () => {
    const sessions = [{ clock_in_at: at('01:00'), clock_out_at: at('10:00') }]
    const driveBys = [visit('02:00', '02:03'), visit('02:30', '02:33'), visit('03:00', '03:03')]
    expect(dayEffectiveness(sessions, driveBys, '2026-10-14', shift, 0, rulesShort5).creditedMs).toBe(0)
  })

  it('uses the server paid time when given', () => {
    const sessions = [{ clock_in_at: at('01:00'), clock_out_at: at('10:00') }]
    expect(dayEffectiveness(sessions, [], '2026-10-14', shift, 0, rulesShort5, 7 * HOUR).scheduledPaidMs).toBe(7 * HOUR)
  })
})

describe('uniqueCustomerTarget', () => {
  const t = { uniqueTarget: 5, fullDayHours: 8 }
  it('is the full target on a full day', () => {
    expect(uniqueCustomerTarget({ breakMinutes: 30, breakPaid: false, start: '08:30', end: '17:00' }, t)).toBe(5)
  })

  it('scales a half-day Saturday by its hours', () => {
    // 08:30-12:00 = 3.5 h of 8 -> 2.19 -> 2
    expect(uniqueCustomerTarget({ breakMinutes: 0, breakPaid: true, start: '08:30', end: '12:00' }, t)).toBe(2)
  })

  it('is at least 1, and the full target when the hours are unknown', () => {
    expect(uniqueCustomerTarget({ breakMinutes: 0, breakPaid: true, start: '08:00', end: '08:30' }, t)).toBe(1)
    expect(uniqueCustomerTarget(null, t)).toBe(5)
  })

  it('does not expect more on a long day', () => {
    expect(uniqueCustomerTarget({ breakMinutes: 0, breakPaid: true, start: '06:00', end: '20:00' }, t)).toBe(5)
  })
})

describe('scaledDailyTarget', () => {
  it('scales a full-day target by the day\'s scheduled hours', () => {
    expect(scaledDailyTarget({ breakMinutes: 30, breakPaid: false, start: '08:30', end: '17:00' }, 10, 8)).toBe(10)
    expect(scaledDailyTarget({ breakMinutes: 0, breakPaid: true, start: '08:30', end: '12:00' }, 10, 8)).toBe(4) // 3.5 h of 8
    expect(scaledDailyTarget(null, 10, 8)).toBe(10)
  })
})

