import { describe, expect, it } from 'vitest'
import { priorityCoverage, priorityPurchaseSince, type PriorityCustomer } from '../priorityCoverage'

const now = new Date('2026-03-31T05:00:00Z').getTime()
const cust = (id: string, o: Partial<PriorityCustomer> = {}): PriorityCustomer => ({ id, shop_name: `Shop ${id}`, owner_id: 'u1', status: 'active', last_purchase_date: '2026-03-20', last_visit_date: null, ...o })

describe('priorityCoverage', () => {
  it('counts only active customers who bought within 90 days', () => {
    const r = priorityCoverage([cust('a'), cust('b', { last_purchase_date: '2025-10-01' }), cust('c', { last_purchase_date: null }), cust('d', { status: 'inactive' })], [], now)
    expect(r.total).toBe(1)
  })

  it('seen = visited within 14 days, by the recorded last visit or the persons own visit', () => {
    const r = priorityCoverage(
      [cust('a', { last_visit_date: '2026-03-25' }), cust('b'), cust('c', { last_visit_date: '2026-02-01' })],
      [{ customer_id: 'b', checked_in_at: '2026-03-30T03:00:00Z' }],
      now
    )
    expect(r.total).toBe(3)
    expect(r.seen).toBe(2)
    expect(r.overdue.map((o) => o.id)).toEqual(['c'])
    expect(r.overdue[0].daysSince).toBe(58)
  })

  it('a cancelled visit does not count; never visited is overdue first', () => {
    const r = priorityCoverage(
      [cust('a', { last_visit_date: '2026-03-01' }), cust('b')],
      [{ customer_id: 'b', checked_in_at: '2026-03-30T03:00:00Z', cancelled_at: '2026-03-30T04:00:00Z' }],
      now
    )
    expect(r.seen).toBe(0)
    expect(r.overdue.map((o) => [o.id, o.daysSince])).toEqual([['b', null], ['a', 30]])
  })

  it('purchase cut-off date', () => {
    expect(priorityPurchaseSince(now)).toBe('2025-12-31')
  })
})
