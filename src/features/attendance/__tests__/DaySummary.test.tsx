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
    expect(html).toContain('Visits')
    expect(html).toContain('/ 10') // the score
    expect(html).toContain('What makes up the score')
    expect(html).not.toContain('Biggest gap') // no information box under the score
    expect(html).toContain('aria-label="How the effectiveness score works"') // the info button
    expect(html).not.toContain('How the score works') // the explanation lives in the popup, closed until asked for
    expect(html).toContain('Active time')
    expect(html).toContain('Orders')
    expect(html).toContain('1 of 2 visits')
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

  it('shows pending and confirmed orders under Ordered, and warns about a mark no order matched', () => {
    const attendance = [{ clock_in_at: '2026-01-01T01:00:00Z', clock_out_at: '2026-01-01T10:00:00Z' }] as AttendanceRow[]
    const visits = ['a', 'b', 'c'].map((id, i) => visit({ id, customer_id: id, checked_in_at: `2026-01-01T0${2 + i}:00:00Z`, checked_out_at: `2026-01-01T0${2 + i}:30:00Z` }))
    const stats = computeJourneyStats([{ date: '2026-01-01', attendance, visits }], 0, null, rules, { a: 'confirmed', b: 'pending', c: 'unmatched' })
    const html = renderToStaticMarkup(<DaySummary stats={stats} rules={rules} firstVisit={{ kind: 'ok' }} paidVisits={0} appointments={0} language="en" />)
    expect(html).toContain('2 of 3 visits')
    expect(html).toContain('1 confirmed · 1 pending')
    expect(html).toContain('Order not found')
  })

  it('shows the counted visits behind the visits ring: 3 effective + 5 not credited of 8 is 4.25 / 8, 53%', () => {
    const attendance = [{ clock_in_at: '2026-01-01T01:00:00Z', clock_out_at: '2026-01-01T10:00:00Z' }] as AttendanceRow[]
    const long = [0, 1, 2].map((i) => visit({ id: `l${i}`, customer_id: `l${i}`, checked_in_at: `2026-01-01T0${2 + i}:00:00Z`, checked_out_at: `2026-01-01T0${2 + i}:30:00Z` }))
    const short = [0, 1, 2, 3, 4].map((i) => visit({ id: `s${i}`, customer_id: `s${i}`, checked_in_at: `2026-01-01T0${5 + (i % 4)}:${i < 4 ? '00' : '40'}:00Z`, checked_out_at: `2026-01-01T0${5 + (i % 4)}:${i < 4 ? '02' : '42'}:00Z` }))
    const stats = computeJourneyStats([{ date: '2026-01-01', attendance, visits: [...long, ...short] }], 0, null, { ...rules, visitTarget: 8 })
    const html = renderToStaticMarkup(<DaySummary stats={stats} rules={{ ...rules, visitTarget: 8 }} firstVisit={{ kind: 'ok' }} paidVisits={0} appointments={0} language="en" />)
    expect(html).toContain('4.25 of 8 visits')
    expect(html).toContain('53%')
    expect(html).toContain('3 effective + 5 × ¼')
  })
})

