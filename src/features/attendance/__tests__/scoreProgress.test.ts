import { describe, expect, it } from 'vitest'
import { isBestDay, scoreProgress, weekMeans } from '../scoreProgress'

const d = (date: string, score: number | null) => ({ date, score })

describe('scoreProgress', () => {
  // 2026-01-05 is a Monday.
  const days = [d('2026-01-05', 6), d('2026-01-06', 7.5), d('2026-01-07', 8), d('2026-01-08', null), d('2026-01-09', 7)]

  it('counts working days in a row at Good or better, skipping unscored days', () => {
    expect(scoreProgress(days, '2026-01-10').streak).toBe(3)
  })

  it('a day below Good breaks the streak', () => {
    expect(scoreProgress([...days, d('2026-01-12', 5)], '2026-01-13').streak).toBe(0)
  })

  it("today in progress below Good doesn't break the streak; at Good it extends it", () => {
    expect(scoreProgress([...days, d('2026-01-12', 3)], '2026-01-12').streak).toBe(3)
    expect(scoreProgress([...days, d('2026-01-12', 7.2)], '2026-01-12').streak).toBe(4)
  })

  it('tracks the longest streak', () => {
    const p = scoreProgress([d('2026-01-05', 8), d('2026-01-06', 8), d('2026-01-07', 8), d('2026-01-08', 4), d('2026-01-09', 8)], '2026-01-10')
    expect(p.bestStreak).toBe(3)
    expect(p.streak).toBe(1)
  })

  it('groups by Monday-start week and finds the best earlier week', () => {
    const w = weekMeans([d('2026-01-04', 9), d('2026-01-05', 6), d('2026-01-06', 8)])
    expect(w.map((x) => [x.start, x.days])).toEqual([['2025-12-29', 1], ['2026-01-05', 2]])
    const p = scoreProgress([d('2026-01-05', 6), d('2026-01-06', 6), d('2026-01-12', 8), d('2026-01-13', 8)], '2026-01-13')
    expect(p.bestWeek?.start).toBe('2026-01-05')
    expect(p.newBestWeek).toBe(true)
  })

  it('needs two days in the week and an earlier week to call a best week', () => {
    expect(scoreProgress([d('2026-01-05', 6), d('2026-01-06', 6), d('2026-01-12', 9)], '2026-01-12').newBestWeek).toBe(false)
    expect(scoreProgress([d('2026-01-12', 9), d('2026-01-13', 9)], '2026-01-13').newBestWeek).toBe(false)
  })

  it('best day: above every earlier day, with enough history, and at Good or better', () => {
    const hist = [d('2026-01-05', 6), d('2026-01-06', 7), d('2026-01-07', 6.5), d('2026-01-08', 8.4)]
    expect(isBestDay(hist, '2026-01-08')).toBe(true)
    expect(isBestDay(hist, '2026-01-07')).toBe(false)
    expect(isBestDay(hist.slice(2), '2026-01-08')).toBe(false)
    expect(isBestDay([d('2026-01-05', 2), d('2026-01-06', 3), d('2026-01-07', 3), d('2026-01-08', 4)], '2026-01-08')).toBe(false)
  })
})
