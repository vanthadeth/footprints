import { describe, expect, it } from 'vitest'
import { DEFAULT_FLAG_RULES, firstVisitStatus, flagRulesOf, gapThresholdMin, isFlaggedGap, visitSpan } from '../flagRules'

const rule = DEFAULT_FLAG_RULES.idle
// Phnom Penh is UTC+7: 09:00 local on the 14th is 02:00Z.
const at = (hhmm: string) => new Date(`2026-10-14T${hhmm}:00+07:00`).getTime()
const MIN = 60_000

describe('gapThresholdMin (mirrors app.idle_threshold_minutes)', () => {
  it('is the idle threshold outside lunch and the lunch threshold when overlapping 11:00-14:00', () => {
    expect(gapThresholdMin(at('08:00'), at('09:00'), rule)).toBe(45)
    expect(gapThresholdMin(at('12:00'), at('12:30'), rule)).toBe(90)
    expect(gapThresholdMin(at('10:50'), at('11:10'), rule)).toBe(90)
    expect(gapThresholdMin(at('13:50'), at('14:30'), rule)).toBe(90)
  })

  it('does not count a gap that only touches the edge of lunch', () => {
    expect(gapThresholdMin(at('09:00'), at('11:00'), rule)).toBe(45)
    expect(gapThresholdMin(at('14:00'), at('15:00'), rule)).toBe(45)
  })

  it('uses the normal threshold for a gap across two days', () => {
    expect(gapThresholdMin(at('10:00'), new Date('2026-10-15T12:00:00+07:00').getTime(), rule)).toBe(45)
  })

  it('never lowers the idle threshold', () => {
    expect(gapThresholdMin(at('12:00'), at('12:30'), { ...rule, lunchMin: 30 })).toBe(45)
  })
})

describe('isFlaggedGap', () => {
  it('flags a gap longer than 45 min outside lunch', () => {
    expect(isFlaggedGap(at('08:00'), at('08:46'), rule)).toBe(true)
    expect(isFlaggedGap(at('08:00'), at('08:45'), rule)).toBe(false)
  })

  it('needs more than 90 min when the gap overlaps lunch', () => {
    expect(isFlaggedGap(at('11:30'), at('12:50'), rule)).toBe(false) // 80 min
    expect(isFlaggedGap(at('11:30'), at('13:11'), rule)).toBe(true) // 101 min
  })

  it('is never flagged when empty or backwards', () => {
    expect(isFlaggedGap(at('09:00'), at('09:00'), rule)).toBe(false)
    expect(isFlaggedGap(at('10:00'), at('09:00'), rule)).toBe(false)
  })
})

describe('visitSpan', () => {
  const visit = (outMin: number | null, flags: string[] = []) => ({
    checked_in_at: '2026-10-14T02:00:00.000Z',
    checked_out_at: outMin === null ? null : new Date(Date.parse('2026-10-14T02:00:00.000Z') + outMin * MIN).toISOString(),
    flags,
  })
  const now = Date.parse('2026-10-14T09:00:00.000Z')

  it('is check-in to check-out for a normal visit', () => {
    const [s, e] = visitSpan(visit(50), now)
    expect((e - s) / MIN).toBe(50)
  })

  it('counts a forgotten visit (closed at clock-out or end of day) at most 30 min', () => {
    expect((visitSpan(visit(300, ['AUTO_CHECKOUT_CLOCK_OUT']), now)[1] - Date.parse('2026-10-14T02:00:00.000Z')) / MIN).toBe(30)
    expect((visitSpan(visit(300, ['AUTO_CHECKOUT_WORKING_HOURS_END']), now)[1] - Date.parse('2026-10-14T02:00:00.000Z')) / MIN).toBe(30)
  })

  it('leaves a short forgotten visit and a radius auto check-out alone', () => {
    expect((visitSpan(visit(20, ['AUTO_CHECKOUT_CLOCK_OUT']), now)[1] - Date.parse('2026-10-14T02:00:00.000Z')) / MIN).toBe(20)
    expect((visitSpan(visit(300, ['AUTO_CHECKOUT_OUTSIDE_RADIUS']), now)[1] - Date.parse('2026-10-14T02:00:00.000Z')) / MIN).toBe(300)
  })

  it('runs an open visit to now, and honours another cap', () => {
    expect(visitSpan(visit(null), now)[1]).toBe(now)
    expect((visitSpan(visit(300, ['AUTO_CHECKOUT_CLOCK_OUT']), now, 45)[1] - Date.parse('2026-10-14T02:00:00.000Z')) / MIN).toBe(45)
  })
})

describe('firstVisitStatus', () => {
  const day = '2026-10-14'
  const visit = (hhmm: string, cancelled = false) => ({ checked_in_at: new Date(`${day}T${hhmm}:00+07:00`).toISOString(), cancelled_at: cancelled ? 'x' : null })

  it('is fine when the first visit is on or before 10:00, late after', () => {
    expect(firstVisitStatus([visit('09:59')], true, day, '10:00:00', at('18:00')).kind).toBe('ok')
    expect(firstVisitStatus([visit('10:00')], true, day, '10:00:00', at('18:00')).kind).toBe('ok')
    expect(firstVisitStatus([visit('10:01')], true, day, '10:00:00', at('18:00')).kind).toBe('late')
  })

  it('judges the FIRST visit only, and ignores a cancelled one', () => {
    expect(firstVisitStatus([visit('09:00'), visit('11:00')], true, day, '10:00:00', at('18:00')).kind).toBe('ok')
    expect(firstVisitStatus([visit('09:00', true), visit('11:00')], true, day, '10:00:00', at('18:00')).kind).toBe('late')
  })

  it('flags no visit at all once clocked in past the deadline, and waits before then', () => {
    expect(firstVisitStatus([], true, day, '10:00:00', at('10:30')).kind).toBe('none')
    expect(firstVisitStatus([], true, day, '10:00:00', at('09:30')).kind).toBe('pending')
    expect(firstVisitStatus([], false, day, '10:00:00', at('10:30')).kind).toBe('pending')
  })
})

describe('flagRulesOf', () => {
  it('maps the live settings', () => {
    const r = flagRulesOf({ idleAlertThresholdMinutes: 30, lunchWindowStart: '12:00:00', lunchWindowEnd: '13:00:00', lunchIdleThresholdMinutes: 60, forgottenVisitCapMinutes: 20, firstVisitDeadline: '09:30:00', shortVisitThresholdMinutes: 3, visitCreditCapMinutes: 50, dailyUniqueCustomerTarget: 6, dailyWorkingHours: 7.5 })
    expect(r.idle).toEqual({ idleMin: 30, lunchStart: '12:00:00', lunchEnd: '13:00:00', lunchMin: 60 })
    expect(r.forgottenCapMin).toBe(20)
    expect(r.firstVisitDeadline).toBe('09:30:00')
    expect(r).toMatchObject({ shortVisitMin: 3, visitCreditCapMin: 50, uniqueTarget: 6, fullDayHours: 7.5 })
  })
})
