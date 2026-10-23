import { describe, expect, it } from 'vitest'
import {
  EMPTY_FILTER,
  activeCount,
  dayDiff,
  filterChips,
  freqText,
  lastVisitChip,
  lastVisitText,
  outcomeText,
  pageButtons,
  pager,
  peopleLabel,
  removeChip,
  shortDay,
  summarize,
  toggle,
  urgency,
  outcomeChips,
  visitMetrics,
} from '../book'
import type { ActivityRow, SummaryRow } from '../customerBookService'

const names = { a: 'Dara Pich', b: 'Sokha Meas', c: 'Sina Kim' }

describe('urgency', () => {
  it('follows the filter ranges', () => {
    expect([null, 0, 7, 8, 14, 15, 30, 31, 60, 61].map(urgency)).toEqual(['never', 'fresh', 'fresh', 'ok', 'ok', 'due', 'due', 'overdue', 'overdue', 'lapsed'])
  })
})

describe('filter model', () => {
  it('counts ranges plus one for the people section', () => {
    expect(activeCount(EMPTY_FILTER)).toBe(0)
    expect(activeCount({ ...EMPTY_FILTER, ranges: ['31-60', '60+'] })).toBe(2)
    expect(activeCount({ ...EMPTY_FILTER, mode: 'not' })).toBe(1)
    expect(activeCount({ ...EMPTY_FILTER, ranges: ['never'], people: ['a', 'b'] })).toBe(2)
  })

  it('labels people by first name', () => {
    expect(peopleLabel({ ...EMPTY_FILTER, people: ['a'] }, names)).toBe('Visited by Dara · 3 months')
    expect(peopleLabel({ ...EMPTY_FILTER, people: ['a', 'b'], mode: 'not', months: 1 }, names)).toBe('Not visited by Dara & Sokha · 1 month')
    expect(peopleLabel({ ...EMPTY_FILTER, people: ['a', 'b', 'c'], months: 12 }, names)).toBe('Visited by Dara +2 · 12 months')
    expect(peopleLabel({ ...EMPTY_FILTER, mode: 'not' }, names)).toBe('Not visited by anyone · 3 months')
  })

  it('builds removable chips', () => {
    const f = { ...EMPTY_FILTER, ranges: ['31-60', '60+'] as const, people: ['a'], mode: 'not' as const }
    const g = { ...f, ranges: [...f.ranges] }
    expect(filterChips(g, names).map((c) => c.label)).toEqual(['31–60 days', '60+ days', 'Not visited by Dara · 3 months'])
    expect(removeChip(g, 'r:60+').ranges).toEqual(['31-60'])
    expect(removeChip(g, 'people')).toMatchObject({ people: [], mode: 'visited', ranges: ['31-60', '60+'] })
  })

  it('toggles values', () => {
    expect(toggle(['a'], 'b')).toEqual(['a', 'b'])
    expect(toggle(['a', 'b'], 'a')).toEqual(['b'])
  })
})

describe('summarize', () => {
  const rows: SummaryRow[] = [
    { province_code: 'KND', province_name: 'ខេត្ត កណ្តាល', bucket: '0-14', n: 10 },
    { province_code: 'PNH', province_name: 'ក្រុង ភ្នំពេញ', bucket: '0-14', n: 50 },
    { province_code: 'PNH', province_name: 'ក្រុង ភ្នំពេញ', bucket: '60+', n: 5 },
    { province_code: 'PNH', province_name: 'ក្រុង ភ្នំពេញ', bucket: 'never', n: 900 },
    { province_code: 'none', province_name: 'No province', bucket: 'never', n: 3 },
  ]

  it('groups provinces biggest first with no-province last', () => {
    const s = summarize(rows, [])
    expect(s.provinces.map((p) => p.code)).toEqual(['PNH', 'KND', 'none'])
    expect(s.provinces[0]).toMatchObject({ en: 'Phnom Penh', total: 955, matching: 955, late: 905 })
    expect(s.total).toBe(968)
    expect(s.rangeCounts).toEqual({ '0-14': 60, '15-30': 0, '31-60': 0, '60+': 5, never: 903 })
  })

  it('applies the range filter to matching, not to range counts', () => {
    const s = summarize(rows, ['60+'])
    expect(s.provinces[0]).toMatchObject({ total: 955, matching: 5, late: 5 })
    expect(s.matching).toBe(5)
    expect(s.rangeCounts['0-14']).toBe(60)
  })
})

describe('row text', () => {
  const base = { last_by_name: 'Dara Pich', last_by_nickname: null }

  it('says how long ago and who', () => {
    expect(lastVisitText({ ...base, days_since: 12 })).toBe('12 days · Dara')
    expect(lastVisitText({ ...base, days_since: 0 })).toBe('Today · Dara')
    expect(lastVisitText({ ...base, days_since: 1, last_by_nickname: 'Rith' })).toBe('1 day · Rith')
    expect(lastVisitText({ ...base, days_since: null })).toBe('Never visited')
  })

  it('leads the chip with the urgency when it matters', () => {
    expect(lastVisitChip({ ...base, days_since: 5 })).toBe('5 days · Dara')
    expect(lastVisitChip({ ...base, days_since: 22 })).toBe('Due · 22 days · Dara')
    expect(lastVisitChip({ ...base, days_since: 45 })).toBe('Overdue · 45 days · Dara')
    expect(lastVisitChip({ ...base, days_since: 90 })).toBe('Lapsed · 90 days · Dara')
  })

  it('describes frequency and outcome', () => {
    expect(freqText({ freq_days: 9, visits_90: 5 })).toBe('every ~9 days')
    expect(freqText({ freq_days: null, visits_90: 1 })).toBe('once in 90 days')
    expect(freqText({ freq_days: null, visits_90: 0 })).toBe('—')
    const v = { last_visit_at: '2026-09-20T03:00:00Z', last_visit_status: 'Met the owner', last_order_status: 'Ordered', last_amount: 120 }
    expect(outcomeText(v)).toBe('Ordered · $120')
    expect(outcomeText({ ...v, last_visit_status: 'Nobody there', last_order_status: 'No order' })).toBe('Nobody there')
    expect(outcomeText({ ...v, last_order_status: 'Will order later' })).toBe('Will order later')
    expect(outcomeText({ ...v, last_visit_at: null })).toBe('—')
  })
})

describe('dates', () => {
  it('formats short days in the app timezone', () => {
    expect(shortDay('2026-09-18')).toBe('Fri 18 Sep')
    // 18:30 UTC on the 17th is already the 18th in Phnom Penh.
    expect(shortDay('2026-09-17T18:30:00Z')).toBe('Fri 18 Sep')
    expect(dayDiff('2026-09-18', '2026-09-30')).toBe(12)
  })
})

describe('paging', () => {
  it('labels the range shown', () => {
    expect(pager(1089, 1)).toMatchObject({ pages: 55, from: 1, to: 20, label: '1–20 of 1,089' })
    expect(pager(1089, 55)).toMatchObject({ from: 1081, to: 1089 })
    expect(pager(1089, 99).page).toBe(55)
    expect(pager(0, 1)).toMatchObject({ pages: 1, label: 'No customers' })
  })

  it('shows first, last and neighbours', () => {
    expect(pageButtons(55, 1)).toEqual([1, 2, '…', 55])
    expect(pageButtons(55, 10)).toEqual([1, '…', 9, 10, 11, '…', 55])
    expect(pageButtons(3, 2)).toEqual([1, 2, 3])
    expect(pageButtons(1, 1)).toEqual([1])
  })
})

describe('visit metrics', () => {
  const v = (id: string, iso: string, user: string, over: Partial<ActivityRow> = {}): ActivityRow => ({
    visit_id: id, checked_in_at: iso, user_id: user, full_name: user === 'a' ? 'Dara Pich' : 'Sokha Meas', nickname: null,
    visit_status: 'Met the owner', order_status: 'Ordered', payment_status: 'Part paid', order_amount: 86, collected: 40,
    remarks: null, next_visit: null, cancelled_at: null, cancel_reason: null, ...over,
  })
  // Newest first, as customer_visit_activity returns them.
  const rows = [
    v('1', '2026-09-18T03:00:00Z', 'a', { next_visit: '2026-10-02T02:00:00Z' }),
    v('x', '2026-09-15T03:00:00Z', 'a', { cancelled_at: '2026-09-15T04:00:00Z', cancel_reason: 'Checked in by mistake' }),
    v('2', '2026-09-07T03:00:00Z', 'b'),
    v('3', '2026-08-27T03:00:00Z', 'a'),
    v('old', '2026-05-01T03:00:00Z', 'b'),
  ]

  it('skips voided visits and counts the last 90 days', () => {
    const m = visitMetrics(rows, '2026-09-30')
    expect(m.last?.visit_id).toBe('1')
    expect(m.lastDays).toBe(12)
    expect(m.visits90).toBe(3)
    expect(m.people90).toBe(2)
    // 27 Aug -> 18 Sep is 22 days over 2 gaps.
    expect(m.freqDays).toBe(11)
    expect(m.next).toEqual({ day: '2026-10-02', by: 'Dara' })
  })

  it('handles no visits', () => {
    expect(visitMetrics([], '2026-09-30')).toMatchObject({ last: null, lastDays: null, visits90: 0, freqDays: null, next: null })
  })

  it('builds outcome chips', () => {
    expect(outcomeChips(rows[0]).map((c) => c.label)).toEqual(['Met the owner', 'Ordered · $86', 'Part paid · $40 collected'])
    expect(outcomeChips(rows[1])).toEqual([])
    expect(outcomeChips(v('p', '2026-09-01T00:00:00Z', 'a', { payment_status: 'Paid in full', collected: 86, order_status: 'No order', order_amount: null })).map((c) => c.label)).toEqual(['Met the owner', 'No order', 'Paid in full'])
  })
})
