import { describe, expect, it } from 'vitest'
import type { CoverageRow } from '../coverageService'
import { daysAgo, lastVisitLabel, sortByUrgency, tierCadenceLabel } from '../coverage'

function row(id: string, over: Partial<CoverageRow>): CoverageRow {
  return {
    customer_id: id,
    shop_name: id,
    code: null,
    address: null,
    latitude: null,
    longitude: null,
    tier: 'B',
    cadence_days: 14,
    last_visit_at: null,
    days_since: null,
    due_state: 'ok',
    distance_m: null,
    visited_by_me: true,
    ...over,
  }
}

describe('sortByUrgency', () => {
  it('orders overdue (most overdue first), due, never, then on track', () => {
    const rows = [
      row('ok', { due_state: 'ok', days_since: 3 }),
      row('never', { due_state: 'never' }),
      row('due', { due_state: 'due', days_since: 13 }),
      row('overdueA', { due_state: 'overdue', days_since: 16 }),
      row('overdueB', { due_state: 'overdue', days_since: 9, tier: 'A', cadence_days: 7 }),
      row('overdueC', { due_state: 'overdue', days_since: 40, tier: 'C', cadence_days: 30 }),
    ]
    expect(sortByUrgency(rows).map((r) => r.customer_id)).toEqual(['overdueC', 'overdueA', 'overdueB', 'due', 'never', 'ok'])
  })

  it('breaks ties by distance', () => {
    const rows = [row('far', { due_state: 'never', distance_m: 900 }), row('near', { due_state: 'never', distance_m: 120 })]
    expect(sortByUrgency(rows).map((r) => r.customer_id)).toEqual(['near', 'far'])
  })
})

describe('lastVisitLabel', () => {
  it('describes each state', () => {
    expect(lastVisitLabel({ days_since: null, cadence_days: 14, due_state: 'never' })).toBe('Never visited')
    expect(lastVisitLabel({ days_since: 17, cadence_days: 14, due_state: 'overdue' })).toBe('3 days overdue')
    expect(lastVisitLabel({ days_since: 8, cadence_days: 7, due_state: 'overdue' })).toBe('1 day overdue')
    expect(lastVisitLabel({ days_since: 0, cadence_days: 14, due_state: 'ok' })).toBe('Visited today')
    expect(lastVisitLabel({ days_since: 1, cadence_days: 14, due_state: 'ok' })).toBe('Visited yesterday')
    expect(lastVisitLabel({ days_since: 12, cadence_days: 14, due_state: 'due' })).toBe('Visited 12 days ago')
  })
})

describe('tierCadenceLabel / daysAgo', () => {
  it('maps tiers to cadence, defaulting to B', () => {
    expect(tierCadenceLabel('A')).toBe('Weekly')
    expect(tierCadenceLabel('B')).toBe('Every 2 weeks')
    expect(tierCadenceLabel('C')).toBe('Monthly')
    expect(tierCadenceLabel('?')).toBe('Every 2 weeks')
  })

  it('counts calendar days in the given timezone', () => {
    // 20:00 UTC on the 20th is already 03:00 on the 21st in Phnom Penh.
    expect(daysAgo('2026-09-20T20:00:00Z', '2026-09-25', 'Asia/Phnom_Penh')).toBe(4)
    expect(daysAgo(null, '2026-09-25', 'Asia/Phnom_Penh')).toBeNull()
  })
})
