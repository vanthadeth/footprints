import { describe, expect, it } from 'vitest'
import { applyPick, coverage, isOverdue, matchesQuery, visitNext } from '../customerPicks'
import type { BookRow } from '../customerBookService'

const row = (p: Partial<BookRow>): BookRow => ({ customer_id: 'c', shop_name: 'Shop', code: null, district: null, province_code: 'KCN', province_name: 'Phnom Penh', owner_id: null, owner_name: null, owner_nickname: null, last_visit_at: null, days_since: 3, last_by_id: null, last_by_name: null, last_by_nickname: null, visits_90: 0, freq_days: null, last_visit_status: null, last_order_status: null, last_amount: null, last_payment: null, last_collected: null, next_visit: null, bucket: '0-14', distance_m: null, total_count: 1, ...p })

describe('customerPicks', () => {
  it('treats 45+ days and never as overdue', () => {
    expect(isOverdue({ days_since: 46 })).toBe(true)
    expect(isOverdue({ days_since: 45 })).toBe(false)
    expect(isOverdue({ days_since: null })).toBe(true)
  })
  it('narrows by quick chip', () => {
    const rows = [row({ customer_id: 'a', days_since: 3 }), row({ customer_id: 'b', days_since: 60, next_visit: '2026-11-03' }), row({ customer_id: 'c', days_since: null })]
    expect(applyPick(rows, 'overdue', '2026-10-31', new Set()).map((r) => r.customer_id)).toEqual(['b', 'c'])
    expect(applyPick(rows, 'never', '2026-10-31', new Set()).map((r) => r.customer_id)).toEqual(['c'])
    expect(applyPick(rows, 'due', '2026-10-31', new Set()).map((r) => r.customer_id)).toEqual(['b'])
    expect(applyPick(rows, 'plan', '2026-10-31', new Set(['a'])).map((r) => r.customer_id)).toEqual(['a'])
    expect(applyPick(rows, 'near', '2026-10-31', new Set())).toHaveLength(3)
  })
  it('matches name, code, district and province', () => {
    expect(matchesQuery(row({ shop_name: 'Lucky Mart' }), 'lucky')).toBe(true)
    expect(matchesQuery(row({ code: 'C-102' }), 'c-1')).toBe(true)
    expect(matchesQuery(row({ district: 'Sen Sok' }), 'sen')).toBe(true)
    expect(matchesQuery(row({}), 'zzz')).toBe(false)
  })
  it('bands coverage', () => {
    const c = coverage([row({ days_since: 2 }), row({ days_since: 10 }), row({ days_since: 20 }), row({ days_since: 40 }), row({ days_since: 90 }), row({ days_since: null })])
    expect(c.buckets.map((b) => b.count)).toEqual([1, 1, 1, 1, 2])
    expect(c.within45).toBe(4)
  })
  it('picks the nearest overdue customer, else the longest unseen', () => {
    const a = row({ customer_id: 'a', days_since: 3 }), b = row({ customer_id: 'b', days_since: 60 }), c = row({ customer_id: 'c', days_since: 90 })
    expect(visitNext([a, b, c], [a, b, c])?.customer_id).toBe('b')
    expect(visitNext([a, b, c], null)?.customer_id).toBe('c')
    expect(visitNext([a], null)).toBeNull()
  })
})
