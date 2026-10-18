import { describe, expect, it } from 'vitest'
import { effectiveness, effectivenessPercent, paidMsOverDays, paidWorkMs } from '../efficiency'

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

describe('effectiveness', () => {
  it('is visiting time over paid time', () => {
    expect(effectiveness(2 * HOUR, 8 * HOUR)).toBe(0.25)
    expect(effectivenessPercent(2 * HOUR, 8 * HOUR)).toBe(25)
  })

  it('never exceeds 100% (overlapping visits, a visit running past clock-out)', () => {
    expect(effectiveness(10 * HOUR, 8 * HOUR)).toBe(1)
    expect(effectivenessPercent(10 * HOUR, 8 * HOUR)).toBe(100)
  })

  it('has nothing to measure without paid time', () => {
    expect(effectiveness(HOUR, 0)).toBe(0)
    expect(effectivenessPercent(HOUR, 0)).toBeNull()
  })
})

describe('paidMsOverDays', () => {
  const day = (date: string, from: string, to: string) => ({ date, attendance: [{ clock_in_at: `${date}T${from}:00.000Z`, clock_out_at: `${date}T${to}:00.000Z` }] })

  it('uses the server figure for whole days and works out live days itself', () => {
    const days = [day('2026-10-13', '01:00', '09:00'), day('2026-10-14', '01:00', '09:00')]
    // Monday: server says 7 h paid. Tuesday is live: 8 h clocked, 30 min unpaid break comes off.
    const total = paidMsOverDays(days, { '2026-10-13': 420 }, new Set(['2026-10-14']), 0, unpaid30)
    expect(total).toBe(7 * HOUR + 7.5 * HOUR)
  })

  it('falls back to its own working-out for a day the server has no figure for', () => {
    expect(paidMsOverDays([day('2026-10-13', '01:00', '09:00')], {}, new Set(), 0, unpaid30)).toBe(7.5 * HOUR)
    expect(paidMsOverDays([day('2026-10-13', '01:00', '09:00')], undefined, new Set(), 0)).toBe(8 * HOUR)
  })
})
