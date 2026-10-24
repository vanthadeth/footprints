import { describe, expect, it } from 'vitest'
import { dayBreakdown, daySegments, segmentsFor } from './dayBar'
import { DEFAULT_FLAG_RULES } from '@/features/attendance/flagRules'

const t = (h: number, m = 0) => (h * 60 + m) * 60_000
const base = { shiftStart: t(8), shiftEnd: t(17), idle: DEFAULT_FLAG_RULES.idle }
const kinds = (s: { kind: string; from: number; to: number }[]) => s.map((x) => `${x.kind} ${x.from / 60_000}-${x.to / 60_000}`)

describe('daySegments', () => {
  it('shows missed time and the rest of the shift when nobody clocked in', () => {
    expect(kinds(daySegments({ ...base, clockIn: null, clockOut: null, visits: [], now: t(11) }))).toEqual(['miss 480-660', 'todo 660-1020'])
  })

  it('splits a working day into early time, gaps, visits, a flagged gap past the limit and what is left', () => {
    const s = daySegments({
      ...base,
      clockIn: t(7, 50),
      clockOut: null,
      visits: [
        [t(8, 30), t(9, 15)],
        [t(10, 30), null],
      ],
      now: t(11),
    })
    expect(kinds(s)).toEqual(['out 470-480', 'gap 480-510', 'visit 510-555', 'flag 555-630', 'visit 630-660', 'todo 660-1020'])
  })

  it('ends at the clock-out with nothing still to come, and marks overtime as outside hours', () => {
    const s = daySegments({ ...base, clockIn: t(8), clockOut: t(17, 30), visits: [[t(8, 30), t(16, 40)]], now: t(18) })
    // 16:40 -> 17:30 is a 50 min gap after a visit: flagged, apart from the part outside working hours.
    expect(kinds(s)).toEqual(['gap 480-510', 'visit 510-1000', 'flag 1000-1020', 'out 1020-1050'])
  })

  it('clips visits that start before the clock-in and ignores ones fully covered by an earlier visit', () => {
    const s = daySegments({
      ...base,
      clockIn: t(8),
      clockOut: t(10),
      visits: [
        [t(7, 50), t(8, 20)],
        [t(8, 5), t(8, 10)],
      ],
      now: t(12),
    })
    expect(kinds(s)).toEqual(['visit 480-500', 'flag 500-600'])
  })

  it('shows the time between two sessions as off the clock; the first-visit rule starts again at each clock-in', () => {
    const s = daySegments({
      ...base,
      clockIn: t(8),
      clockOut: null,
      sessions: [
        [t(13), null],
        [t(8), t(12)],
      ],
      visits: [
        [t(8, 30), t(11, 30)],
        [t(13, 40), t(14)],
      ],
      now: t(14, 30),
    })
    expect(kinds(s)).toEqual(['gap 480-510', 'visit 510-690', 'gap 690-720', 'off 720-780', 'gap 780-820', 'visit 820-840', 'gap 840-870', 'todo 870-1020'])
  })

  it('ends at the last clock-out when every session is closed; with no visit yet nothing is flagged', () => {
    const s = daySegments({ ...base, clockIn: t(8), clockOut: t(16), sessions: [[t(8), t(10)], [t(11), t(16)]], visits: [], now: t(17) })
    expect(kinds(s)).toEqual(['gap 480-600', 'off 600-660', 'gap 660-960'])
  })

  it('remembers which visit each visit stretch is', () => {
    const s = daySegments({ ...base, clockIn: t(8), clockOut: t(12), visits: [[t(10), t(11)], [t(8, 30), t(9)]], now: t(12) })
    expect(s.filter((g) => g.kind === 'visit').map((g) => g.visit)).toEqual([1, 0])
  })
})

describe('segmentsFor', () => {
  const segBase = { shiftStart: t(8), shiftEnd: t(17), flagRules: DEFAULT_FLAG_RULES }

  it('builds the sessions from every attendance row of the day', () => {
    const iso = (h: number, m = 0) => new Date((h * 60 + m) * 60_000).toISOString()
    const r = segmentsFor({
      attendance: [
        { clock_in_at: iso(8), clock_out_at: iso(12) },
        { clock_in_at: iso(13), clock_out_at: iso(17) },
      ],
      visits: [],
      ...segBase,
      now: t(18),
    })
    expect([r.clockIn, r.clockOut]).toEqual([t(8), t(17)])
    expect(r.segs.some((g) => g.kind === 'off' && g.from === t(12) && g.to === t(13))).toBe(true)
  })
})

describe('dayBreakdown', () => {
  it('gives minutes per kind and shares that add up to 100', () => {
    const rows = dayBreakdown([
      { kind: 'out', from: t(7, 50), to: t(8) },
      { kind: 'gap', from: t(8), to: t(8, 37) },
      { kind: 'visit', from: t(8, 37), to: t(9, 12) },
      { kind: 'flag', from: t(9, 12), to: t(9, 53) },
      { kind: 'todo', from: t(9, 53), to: t(17) },
    ])
    expect(rows.map((r) => [r.kind, r.minutes])).toEqual([['out', 10], ['gap', 37], ['flag', 41], ['visit', 35]])
    expect(rows.reduce((n, r) => n + r.pct, 0)).toBe(100)
  })

  it('is all zero before any time on the clock', () => {
    expect(dayBreakdown([{ kind: 'todo', from: t(8), to: t(17) }]).every((r) => r.minutes === 0 && r.pct === 0)).toBe(true)
  })
})

// Real local (Phnom Penh) times, so the lunch window applies.
const L = (hhmm: string) => new Date(`2026-10-14T${hhmm}:00+07:00`).getTime()
const lbase = { shiftStart: L('08:00'), shiftEnd: L('17:00'), idle: DEFAULT_FLAG_RULES.idle }
const lkinds = (s: { kind: string; from: number; to: number }[]) => s.map((x) => `${x.kind} ${new Date(x.from).toISOString().slice(11, 16)}-${new Date(x.to).toISOString().slice(11, 16)}`)

describe('flag rules on the day bar', () => {
  it('flags a whole gap longer than 45 min after the first visit', () => {
    const s = daySegments({ ...lbase, clockIn: L('08:00'), clockOut: L('10:30'), visits: [[L('08:00'), L('09:00')], [L('10:10'), L('10:30')]], now: L('12:00') })
    expect(lkinds(s)).toEqual(['visit 01:00-02:00', 'flag 02:00-03:10', 'visit 03:10-03:30'])
  })

  it('does not flag a gap of 45 min or less', () => {
    const s = daySegments({ ...lbase, clockIn: L('08:00'), clockOut: L('10:00'), visits: [[L('08:00'), L('09:00')], [L('09:45'), L('10:00')]], now: L('12:00') })
    expect(lkinds(s)).toEqual(['visit 01:00-02:00', 'gap 02:00-02:45', 'visit 02:45-03:00'])
  })

  it('never flags the stretch from clock-in to the first visit', () => {
    const s = daySegments({ ...lbase, clockIn: L('08:00'), clockOut: L('12:00'), visits: [[L('10:00'), L('10:30')]], now: L('12:00') })
    expect(lkinds(s)).toEqual(['gap 01:00-03:00', 'visit 03:00-03:30', 'gap 03:30-05:00'])
  })

  it('needs more than 90 min for a gap that overlaps the lunch window', () => {
    const lunch80 = daySegments({ ...lbase, clockIn: L('08:00'), clockOut: L('13:00'), visits: [[L('10:30'), L('11:30')], [L('12:50'), L('13:00')]], now: L('14:00') })
    expect(lkinds(lunch80).filter((k) => k.startsWith('flag'))).toEqual([])
    const lunch101 = daySegments({ ...lbase, clockIn: L('08:00'), clockOut: L('13:30'), visits: [[L('10:30'), L('11:30')], [L('13:11'), L('13:30')]], now: L('14:00') })
    expect(lkinds(lunch101).filter((k) => k.startsWith('flag'))).toEqual(['flag 04:30-06:11'])
  })

  it('flags the time after the last check-out, to the clock-out', () => {
    const s = daySegments({ ...lbase, clockIn: L('08:00'), clockOut: L('16:00'), visits: [[L('08:30'), L('09:00')]], now: L('17:00') })
    expect(lkinds(s)).toEqual(['gap 01:00-01:30', 'visit 01:30-02:00', 'flag 02:00-09:00'])
  })

  it('counts a forgotten visit at the cap, the rest is a flagged gap', () => {
    const r = segmentsFor({
      attendance: [{ clock_in_at: new Date(L('08:00')).toISOString(), clock_out_at: new Date(L('12:00')).toISOString() }],
      visits: [{ checked_in_at: new Date(L('09:00')).toISOString(), checked_out_at: new Date(L('12:00')).toISOString(), cancelled_at: null, flags: ['AUTO_CHECKOUT_CLOCK_OUT'] }],
      shiftStart: L('08:00'),
      shiftEnd: L('17:00'),
      flagRules: DEFAULT_FLAG_RULES,
      now: L('13:00'),
    })
    expect(lkinds(r.segs)).toEqual(['gap 01:00-02:00', 'visit 02:00-02:30', 'flag 02:30-05:00'])
  })
})
