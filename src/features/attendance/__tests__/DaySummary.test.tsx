import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DaySummary } from '../DaySummary'
import { computeJourneyStats } from '../journeyStats'
import { DEFAULT_FLAG_RULES } from '../flagRules'
import type { AttendanceRow, VisitRow } from '../types'

const visit = (o: Partial<VisitRow>) => ({ id: Math.random().toString(), customer_id: 'c1', flags: [], auto_closed: false, ...o }) as VisitRow

describe('DaySummary', () => {
  const rules = { ...DEFAULT_FLAG_RULES, shortVisitMin: 5 }
  const render = (visits: VisitRow[], extra: Partial<AttendanceRow> = {}) => {
    const attendance = [{ clock_in_at: '2026-01-01T01:00:00Z', clock_out_at: '2026-01-01T10:00:00Z', ...extra }] as AttendanceRow[]
    const stats = computeJourneyStats([{ date: '2026-01-01', attendance, visits }], 0, { breakMinutes: 0, breakPaid: true, start: '08:00', end: '17:00' }, rules)
    return renderToStaticMarkup(<DaySummary stats={stats} rules={rules} firstVisit={{ kind: 'ok' }} paidVisits={0} appointments={0} language="en" />)
  }

  it('shows visits made, effective and not credited, and the three breakdown rows', () => {
    const html = render([
      visit({ checked_in_at: '2026-01-01T02:00:00Z', checked_out_at: '2026-01-01T02:03:00Z' }),
      visit({ customer_id: 'c2', checked_in_at: '2026-01-01T03:00:00Z', checked_out_at: '2026-01-01T03:30:00Z', order_amount_usd: 50 }),
    ])
    expect(html).toContain('1 effective')
    expect(html).toContain('1 not credited')
    expect(html).toContain('Customers')
    expect(html).toContain('vs target')
    expect(html).toContain('Active time')
    expect(html).toContain('vs working hours')
    expect(html).toContain('Ordered')
    expect(html).toContain('vs visits')
    expect(html).toContain('<circle') // the rings
    expect(html).toContain('1 / 2')
    expect(html).toContain('Long idle gaps') // 57 min between the visits, and 6 h after the last
  })

  it('says so when there is nothing to warn about', () => {
    const html = render([visit({ checked_in_at: '2026-01-01T02:00:00Z', checked_out_at: '2026-01-01T02:30:00Z' })], { clock_out_at: '2026-01-01T02:40:00Z' })
    expect(html).toContain('Nothing forgotten')
  })

  it('warns about a forgotten check-out and a forgotten clock-out', () => {
    const html = render([visit({ checked_in_at: '2026-01-01T02:00:00Z', checked_out_at: '2026-01-01T08:00:00Z', flags: ['AUTO_CHECKOUT_CLOCK_OUT'] })], { auto_clocked_out: true })
    expect(html).toContain('Forgot to check out')
    expect(html).toContain('Forgot to clock out')
    expect(html).not.toContain('Nothing forgotten')
  })
})
