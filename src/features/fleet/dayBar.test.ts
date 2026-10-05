import { describe, expect, it } from 'vitest'
import { dayBreakdown, daySegments } from './dayBar'

const t = (h: number, m = 0) => (h * 60 + m) * 60_000
const base = { shiftStart: t(8), shiftEnd: t(17), flagAfterMin: 45 }
const kinds = (s: { kind: string; from: number; to: number }[]) => s.map((x) => `${x.kind} ${x.from / 60_000}-${x.to / 60_000}`)

describe('daySegments', () => {
  it('shows missed time and the rest of the shift when nobody clocked in', () => {
    expect(kinds(daySegments({ ...base, clockIn: null, clockOut: null, visits: [], now: t(11) }))).toEqual(['miss 480-660', 'todo 660-1020'])
  })

  it('splits a working day into early time, gaps, visits, idle time past the limit and what is left', () => {
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
    expect(kinds(s)).toEqual(['out 470-480', 'gap 480-510', 'visit 510-555', 'gap 555-600', 'flag 600-630', 'visit 630-660', 'todo 660-1020'])
  })

  it('ends at the clock-out with nothing still to come, and marks overtime as outside hours', () => {
    const s = daySegments({ ...base, clockIn: t(8), clockOut: t(17, 30), visits: [[t(8, 30), t(16, 40)]], now: t(18) })
    expect(kinds(s)).toEqual(['gap 480-510', 'visit 510-1000', 'gap 1000-1020', 'out 1020-1050'])
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
    expect(kinds(s)).toEqual(['visit 480-500', 'gap 500-545', 'flag 545-600'])
  })

  it('remembers which visit each visit stretch is', () => {
    const s = daySegments({ ...base, clockIn: t(8), clockOut: t(12), visits: [[t(10), t(11)], [t(8, 30), t(9)]], now: t(12) })
    expect(s.filter((g) => g.kind === 'visit').map((g) => g.visit)).toEqual([1, 0])
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
