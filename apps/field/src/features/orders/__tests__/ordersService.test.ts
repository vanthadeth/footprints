import { describe, expect, it } from 'vitest'
import { orderBadges, orderValue } from '../ordersService'

describe('order history helpers', () => {
  it('reads status and approval', () => {
    expect(orderBadges({ status: 'new', approved: true, sheet_status: 1 })).toEqual({ status: { label: 'Valid', tone: 'ok' }, approval: { label: 'Approved', tone: 'ok' } })
    expect(orderBadges({ status: 'cancelled', approved: false, sheet_status: 2 })).toEqual({ status: { label: 'Cancelled', tone: 'muted' }, approval: { label: 'Not approved', tone: 'warn' } })
  })

  it('shows the value in the order’s own currency', () => {
    expect(orderValue({ is_khr: false, total_usd: 1385.32, total_khr: null })).toBe('$1,385.32')
    expect(orderValue({ is_khr: true, total_usd: null, total_khr: 120000 })).toBe('៛120,000')
    expect(orderValue({ is_khr: false, total_usd: null, total_khr: null })).toBe('—')
  })
})
