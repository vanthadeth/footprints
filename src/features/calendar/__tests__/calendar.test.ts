import { describe, expect, it } from 'vitest'
import { addDays, byDay, itemSub, itemTitle, monthGrid, overdue, passes, sortDay } from '../calendar'
import type { CalendarItem } from '../calendarService'

const item = (over: Partial<CalendarItem>): CalendarItem => ({
  kind: 'task', ref_id: 'x', day: '2026-09-30', at_time: null, title: 'T', customer_id: null, customer_name: null, done: false,
  amount: null, source_date: null, source_label: null, assigned_by: null, can_edit: true, sort_order: 0, ...over,
})

describe('calendar helpers', () => {
  it('builds Monday-first month grids in whole weeks', () => {
    const g = monthGrid(2026, 8)
    expect(g.label).toBe('September 2026')
    expect(g.from).toBe('2026-08-31')
    expect(g.to).toBe('2026-10-04')
    expect(g.days).toHaveLength(35)
    expect(g.days.filter((d) => d.inMonth)).toHaveLength(30)
    expect(monthGrid(2026, 12).label).toBe('January 2027')
  })

  it('adds days across months', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('sorts timed items first, then all-day ones', () => {
    const list = sortDay([item({ ref_id: 'a' }), item({ ref_id: 'b', at_time: '14:00:00' }), item({ ref_id: 'c', at_time: '09:30:00' })])
    expect(list.map((i) => i.ref_id)).toEqual(['c', 'b', 'a'])
    expect(byDay([item({ day: '2026-10-01' }), item({})]).get('2026-10-01')).toHaveLength(1)
  })

  it('filters, including leave and holidays together', () => {
    expect(passes(item({ kind: 'holiday' }), 'off')).toBe(true)
    expect(passes(item({ kind: 'leave' }), 'off')).toBe(true)
    expect(passes(item({ kind: 'appt' }), 'collect')).toBe(false)
    expect(passes(item({ kind: 'appt' }), 'all')).toBe(true)
  })

  it('finds overdue to-dos only', () => {
    const list = [item({ day: '2026-09-29' }), item({ day: '2026-09-29', done: true }), item({ day: '2026-09-29', kind: 'appt' }), item({ day: '2026-09-30' })]
    expect(overdue(list, '2026-09-30')).toHaveLength(1)
  })

  it('says what an item is and where it came from', () => {
    const visitCollect = item({ kind: 'collect', amount: 40, customer_name: 'Golden Rice', source_label: 'Part paid', source_date: '2026-09-30' })
    expect(itemTitle(visitCollect)).toBe('Collect $40')
    expect(itemSub(visitCollect)).toBe('Golden Rice · Visit appointment · part paid on Wed 30 Sep')
    const callCollect = item({ kind: 'collect', customer_name: 'Lucky Mini Mart', source_label: 'Delay payment', source_date: '2026-09-28' })
    expect(itemTitle(callCollect)).toBe('Collect payment')
    expect(itemSub(callCollect)).toBe('Lucky Mini Mart · Call follow-up · delay payment on Mon 28 Sep')
    expect(itemTitle(item({ kind: 'appt', title: 'Mekong Hardware' }))).toBe('Visit Mekong Hardware')
    expect(itemSub(item({ kind: 'appt', title: 'Mekong Hardware', source_date: '2026-09-23' }))).toBe('Set after the visit on Wed 23 Sep')
    expect(itemSub(item({ kind: 'task', customer_name: 'Jasmine', assigned_by: 'Lina' }))).toBe('Jasmine · Assigned by Lina')
    expect(itemSub(item({ kind: 'follow', customer_name: 'Diamond', source_label: 'note', source_date: '2026-09-29' }))).toBe('Diamond · From your note on Tue 29 Sep')
  })
})
