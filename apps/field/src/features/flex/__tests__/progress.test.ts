import { describe, expect, it } from 'vitest'
import { counted, progressStatus, whatIf, teamProgressStatus, type FlexProgress, type TeamProgressRow } from '../progress'

const base = { stillNeeded: 9, spare: 5, settled: false, closed: false, shortDays: 0, legacy: false }

describe('counted', () => {
  it('adds worked and credited days', () => expect(counted({ worked: 11, credited: 2 })).toBe(13))
})

describe('progressStatus', () => {
  it('is met once nothing more is needed', () => expect(progressStatus({ ...base, stillNeeded: 0 }).tone).toBe('ok'))
  it('is on track with room to spare', () => expect(progressStatus(base).label).toBe('On track'))
  it('is at risk with one spare day or none', () => {
    expect(progressStatus({ ...base, spare: 1 }).tone).toBe('warn')
    expect(progressStatus({ ...base, spare: 0 }).tone).toBe('warn')
  })
  it('is short when the days left cannot cover it', () => {
    const s = progressStatus({ ...base, spare: -2 })
    expect(s.tone).toBe('danger')
    expect(s.label).toContain('2')
  })
  it('reports a closed cycle by its settlement', () => {
    expect(progressStatus({ ...base, closed: true, settled: true, shortDays: 3 }).tone).toBe('danger')
    expect(progressStatus({ ...base, closed: true, settled: true, shortDays: 0 }).tone).toBe('ok')
  })
  it('shows legacy settlements as settled', () => expect(progressStatus({ ...base, legacy: true, settled: true }).tone).toBe('muted'))
})

describe('whatIf', () => {
  it('keeps spare days when the days off fit', () => {
    expect(whatIf({ spare: 5, stillNeeded: 9 }, 3, 10)).toMatchObject({ spare: 2, short: 0, annual: 0, unpaid: 0 })
  })
  it('takes annual leave first for the days that do not fit', () => {
    expect(whatIf({ spare: 1, stillNeeded: 9 }, 3, 10)).toMatchObject({ short: 2, annual: 2, unpaid: 0, annualAfter: 8 })
  })
  it('then unpaid when annual leave runs out', () => {
    expect(whatIf({ spare: 1, stillNeeded: 9 }, 4, 1)).toMatchObject({ short: 3, annual: 1, unpaid: 2, annualAfter: 0 })
  })
  it('costs nothing once the minimum is already met', () => {
    expect(whatIf({ spare: 3, stillNeeded: 0 }, 5, 0)).toMatchObject({ short: 0, annual: 0, unpaid: 0 })
  })
})

describe('teamProgressStatus', () => {
  const row: TeamProgressRow = { userId: 'u', name: 'A', departmentName: null, isFlexible: true, nextFrom: null, cycleStart: '2026-10-21', cycleEnd: '2026-11-20', minDays: 20, worked: 10, credited: 1, stillNeeded: 9, available: 12, spare: 3, settled: false, shortDays: 0, annualDays: null, unpaidDays: null }
  it('marks a flexible person by progress', () => expect(teamProgressStatus(row, (k) => k, (s) => s).tone).toBe('ok'))
  it('marks a person who cannot make it', () => expect(teamProgressStatus({ ...row, spare: -1 }, (k) => k, (s) => s).tone).toBe('danger'))
})

// keep the type import used
export type _P = FlexProgress
