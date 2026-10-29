import { describe, expect, it } from 'vitest'
import { ageing, bucketOf } from '../ageing'
import { agoText, orderEntries } from '../timeline'

const inv = (no: string, date: string, due: string | null, value: number, status = 5) => ({ inv_no: no, inv_date: date, due_date: due, inv_value: value, status })

describe('ageing', () => {
  it('buckets by days past due', () => {
    expect(bucketOf(-5)).toBe('current')
    expect(bucketOf(0)).toBe('current')
    expect(bucketOf(1)).toBe('d1_30')
    expect(bucketOf(30)).toBe('d1_30')
    expect(bucketOf(31)).toBe('d31_60')
    expect(bucketOf(91)).toBe('d90')
  })
  it('assigns the balance to the newest submitted invoices first', () => {
    const r = ageing([inv('A', '2026-09-01', '2026-10-01', 500), inv('B', '2026-10-06', '2026-11-05', 244), inv('C', '2026-10-10', '2026-11-09', 428.5), inv('V', '2026-10-20', '2026-11-19', 999, 9)], 800, '2026-10-28')
    expect(r.open.map((o) => [o.inv_no, o.open])).toEqual([['C', 428.5], ['B', 244], ['A', 127.5]])
    expect(r.totals.current).toBeCloseTo(672.5)
    expect(r.totals.d1_30).toBeCloseTo(127.5)
    expect(r.total).toBeCloseTo(800)
  })
  it('has nothing open without a balance', () => {
    expect(ageing([inv('A', '2026-09-01', null, 500)], 0, '2026-10-28').open).toEqual([])
    expect(ageing([inv('A', '2026-09-01', null, 500)], null, '2026-10-28').total).toBe(0)
  })
})

describe('timeline', () => {
  it('words the age', () => {
    expect(agoText('2026-10-28', '2026-10-28')).toBe('today')
    expect(agoText('2026-10-24', '2026-10-28')).toBe('4 days ago')
    expect(agoText('2026-09-28', '2026-10-28')).toBe('4 weeks ago')
    expect(agoText(null, '2026-10-28')).toBe('—')
  })
  it('shows a sale order under its invoice, and alone when not invoiced', () => {
    const so = (id: string, no: string, date: string) => ({ id, order_no: no, status: 'new', order_date: date, total_usd: 100, total_khr: null, is_khr: false, approved: true, user_id: 'u1' }) as never
    const inv = { id: 'i1', inv_no: '2026-1', inv_date: '2026-10-05', inv_value: 90, is_khr: false, status: 5, sent_date: '2026-10-06', received_date: null, so_sheet_id: null, sale_order_id: 'o1', user_id: 'u2', due_date: null }
    const rows = orderEntries([so('o1', 'SO-1', '2026-10-01'), so('o2', 'SO-2', '2026-10-08')], [inv])
    expect(rows.map((r) => r.key)).toEqual(['so-o2', 'inv-i1'])
    expect(rows[0].kind).toBe('so')
    expect(rows[1].ref).toEqual({ no: 'SO-1', amount: '$100.00' })
    expect(rows[1].chip.label).toBe('Sent')
    expect(rows[1].userId).toBe('u2')
  })
  it('keeps an invoice whose sale order is not loaded', () => {
    const inv = { id: 'i1', inv_no: '2026-1', inv_date: '2026-10-05', inv_value: 90, is_khr: false, status: 9, sent_date: null, received_date: null, so_sheet_id: null, sale_order_id: 'gone', user_id: null, due_date: null }
    const rows = orderEntries([], [inv])
    expect(rows).toHaveLength(1)
    expect(rows[0].ref).toBeNull()
    expect(rows[0].chip.label).toBe('Void')
  })
})
