import { describe, expect, it } from 'vitest'
import { cadenceText, orderMappings, type Mapping } from '../features/sync/sources'

const m = (id: string, name: string, parentId: string | null = null): Mapping => ({
  id, name, targetTable: name, parentId, engine: 'legacy', handler: null, active: true, trigger: 'interval', intervalMinutes: 60, lastRunAt: null, columns: [],
})

describe('orderMappings', () => {
  it('puts each parent before its own children, whatever order they arrive in', () => {
    const out = orderMappings([m('p2', 'Customer phone 2', 'c'), m('c', 'Customers'), m('p1', 'Customer phone 1', 'c'), m('b', 'Brand')])
    expect(out.map((x) => x.name)).toEqual(['Brand', 'Customers', 'Customer phone 1', 'Customer phone 2'])
  })
  it('treats a child whose parent is missing as a top-level mapping', () => {
    expect(orderMappings([m('x', 'Orphan', 'gone')]).map((x) => x.name)).toEqual(['Orphan'])
  })
})

describe('cadenceText', () => {
  it.each([
    [60, 'Every hour'],
    [1440, 'Every day'],
    [2880, 'Every 2 days'],
    [360, 'Every 6 hours'],
    [90, 'Every 90 min'],
    [null, 'By hand'],
  ])('%s minutes', (minutes, text) => {
    expect(cadenceText({ trigger: 'interval', intervalMinutes: minutes })).toBe(text)
  })
})
