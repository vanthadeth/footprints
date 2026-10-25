import { describe, expect, it } from 'vitest'
import { behindByUsd, classify, countByStatus, percentOfTarget, shiftShare, sortRows, type PerfRow } from '../performance'

const row = (o: Partial<PerfRow> & { id: string }): PerfRow => ({ name: o.id, status: 'pace', salesUsd: 0, targetUsd: 300, visits: 0, share: 0.5, ...o })

describe('shiftShare', () => {
  it('is the share of the shift passed, clamped to 0..1', () => {
    expect(shiftShare(50, 0, 100)).toBe(0.5)
    expect(shiftShare(-10, 0, 100)).toBe(0)
    expect(shiftShare(150, 0, 100)).toBe(1)
    expect(shiftShare(10, 100, 100)).toBe(0)
  })
})

describe('classify', () => {
  it('judges sales against the target so far', () => {
    // Halfway through a $300 day the expected sales are $150.
    expect(classify(180, 300, 0.5)).toBe('ahead')
    expect(classify(150, 300, 0.5)).toBe('pace')
    expect(classify(140, 300, 0.5)).toBe('pace')
    expect(classify(100, 300, 0.5)).toBe('behind')
  })

  it('never calls anyone behind before the shift starts', () => {
    expect(classify(0, 300, 0)).toBe('pace')
    expect(classify(40, 300, 0)).toBe('ahead')
  })
})

describe('behindByUsd and percentOfTarget', () => {
  it('rounds the gap to whole dollars and floors it at zero', () => {
    expect(behindByUsd(100, 300, 0.5)).toBe(50)
    expect(behindByUsd(200, 300, 0.5)).toBe(0)
    expect(percentOfTarget(150, 300)).toBe(50)
    expect(percentOfTarget(150, 0)).toBe(0)
  })
})

describe('sortRows and countByStatus', () => {
  const rows = [
    row({ id: 'leave', status: 'away', away: 'leave' }),
    row({ id: 'ahead-low', status: 'ahead', salesUsd: 200 }),
    row({ id: 'absent', status: 'away', away: 'absent' }),
    row({ id: 'behind-a', status: 'behind', salesUsd: 100 }),
    row({ id: 'behind-b', status: 'behind', salesUsd: 40 }),
    row({ id: 'ahead-high', status: 'ahead', salesUsd: 400 }),
    row({ id: 'pace', status: 'pace', salesUsd: 150 }),
  ]

  it('puts the furthest behind first and away last, absent before leave', () => {
    expect(sortRows(rows).map((r) => r.id)).toEqual(['behind-b', 'behind-a', 'pace', 'ahead-high', 'ahead-low', 'absent', 'leave'])
  })

  it('counts each status', () => {
    expect(countByStatus(rows)).toEqual({ ahead: 2, pace: 1, behind: 2, away: 2 })
  })
})
