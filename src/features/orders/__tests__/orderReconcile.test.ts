import { describe, expect, it } from 'vitest'
import { countsAsOrdered, isMarkedOrdered, orderState, reconcileEndMs } from '../orderReconcile'

// Wednesday 2026-10-14 10:00 local (03:00Z)
const visit = { checked_in_at: '2026-10-14T03:00:00Z' }
const at = (iso: string) => new Date(iso).getTime()
const match = { orderNo: 'SO-1', orderDate: '2026-10-15', totalUsd: 120 }

describe('isMarkedOrdered', () => {
  it('is the Ordered status or an order amount', () => {
    expect(isMarkedOrdered({ ...visit, order_status_id: 'ord' }, 'ord')).toBe(true)
    expect(isMarkedOrdered({ ...visit, order_status_id: 'no' }, 'ord')).toBe(false)
    expect(isMarkedOrdered({ ...visit, order_amount_usd: 50 }, null)).toBe(true)
    expect(isMarkedOrdered({ ...visit, order_amount_usd: 0 }, 'ord')).toBe(false)
  })
})

describe('reconcileEndMs', () => {
  it('closes at the end of the local day two days after the visit', () => {
    // visit on the 14th -> window runs to the end of the 16th (00:00 on the 17th, local)
    expect(reconcileEndMs(visit.checked_in_at, 2)).toBe(at('2026-10-16T17:00:00Z'))
  })

  it('uses the local day, not the UTC day', () => {
    // 23:30 local on the 14th is 16:30Z, still the 14th locally
    expect(reconcileEndMs('2026-10-14T16:30:00Z', 2)).toBe(at('2026-10-16T17:00:00Z'))
    // 00:30 local on the 15th is 17:30Z on the 14th: a day later
    expect(reconcileEndMs('2026-10-14T17:30:00Z', 2)).toBe(at('2026-10-17T17:00:00Z'))
  })
})

describe('orderState', () => {
  it('confirms a marked visit when a synced order matches', () => {
    expect(orderState(visit, true, match, at('2026-10-15T08:00:00Z'))).toBe('confirmed')
  })

  it('finds an order for a visit nobody marked', () => {
    expect(orderState(visit, false, match, at('2026-10-15T08:00:00Z'))).toBe('synced')
  })

  it('keeps a mark pending, counted, while the window is open and no order has synced', () => {
    expect(orderState(visit, true, null, at('2026-10-14T12:00:00Z'))).toBe('pending')
    expect(orderState(visit, true, null, at('2026-10-16T16:59:00Z'))).toBe('pending')
  })

  it('drops a mark nothing matched once the window has closed', () => {
    expect(orderState(visit, true, null, at('2026-10-16T17:00:00Z'))).toBe('unmatched')
    expect(orderState(visit, true, null, at('2026-10-20T00:00:00Z'))).toBe('unmatched')
  })

  it('is none without a mark or an order', () => {
    expect(orderState(visit, false, null, at('2026-10-15T08:00:00Z'))).toBe('none')
  })

  it('confirms whenever the lookup finds an order, even long after the visit', () => {
    expect(orderState(visit, true, match, at('2026-10-30T00:00:00Z'))).toBe('confirmed')
  })
})

describe('countsAsOrdered', () => {
  it('counts confirmed, synced and pending, not unmatched or none', () => {
    expect(countsAsOrdered('confirmed')).toBe(true)
    expect(countsAsOrdered('synced')).toBe(true)
    expect(countsAsOrdered('pending')).toBe(true)
    expect(countsAsOrdered('unmatched')).toBe(false)
    expect(countsAsOrdered('none')).toBe(false)
    expect(countsAsOrdered(undefined)).toBe(false)
  })
})
