import { describe, expect, it } from 'vitest'
import { needsYouLines, type NeedsData } from '../needsYou'

const base: NeedsData = { toDecide: 0, ownPending: 0, plannedStops: 0, nextStop: null, annualLeft: null, shortPeople: [], nextHoliday: null, unreadMessages: 0, onShiftSince: null, lastSync: null }
const t = (k: string, v?: Record<string, string | number>) => (v ? `${k}:${JSON.stringify(v)}` : k)
const keys = (g: Parameters<typeof needsYouLines>[0], d: Partial<NeedsData>) => needsYouLines(g, { ...base, ...d }, t).map((l) => l.key)

describe('needsYouLines', () => {
  it('shows nothing for a manager with nothing waiting', () => expect(keys('manager', {})).toEqual([]))
  it('leads a manager with decisions, then people short of working days', () => {
    expect(keys('manager', { toDecide: 3, shortPeople: [{ name: 'A', have: 9, min: 20 }], unreadMessages: 2 })).toEqual(['decide', 'short', 'messages'])
  })
  it('always gives a salesperson a plan line, asking for a plan when there are no stops', () => {
    const lines = needsYouLines('field', { ...base, annualLeft: 13 }, t)
    expect(lines.map((l) => l.key)).toEqual(['plan', 'leave'])
    expect(lines[0].title).toBe('hubNeeds.noPlan')
    expect(needsYouLines('field', { ...base, plannedStops: 5, nextStop: 'Lucky Mart' }, t)[0].sub).toContain('Lucky Mart')
  })
  it('shows the next holiday to HR and the last sync to admins', () => {
    expect(keys('hr', { nextHoliday: { name: 'Independence Day', inDays: 9 } })).toEqual(['holiday'])
    expect(needsYouLines('admin', { ...base, lastSync: { ok: false, time: '09:12' } }, t)[0].tone).toBe('warn')
  })
  it('caps at three lines', () => {
    expect(keys('hr', { toDecide: 1, shortPeople: [{ name: 'A', have: 1, min: 2 }], nextHoliday: { name: 'X', inDays: 1 } })).toHaveLength(3)
  })
})
