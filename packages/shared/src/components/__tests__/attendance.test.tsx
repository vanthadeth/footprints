import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { dayMark, summarize, type AttendanceRecord } from '../attendance'
import { AttendanceCalendar, AttendanceKey } from '../AttendanceCalendar'

const ctx = { today: '2026-10-23', holidays: ['2026-10-15'] }
const records: Record<string, AttendanceRecord> = {
  '2026-10-05': { result: 'present' },
  '2026-10-06': { result: 'late', minutes: 18 },
  '2026-10-07': { result: 'present' },
  '2026-10-08': { result: 'leave', code: 'AL' },
  '2026-10-09': { result: 'leave', code: 'SL' },
  '2026-10-14': { result: 'absent' },
}

describe('dayMark', () => {
  it('maps each result to the check or the text under the date', () => {
    expect(dayMark('2026-10-05', ctx, records['2026-10-05'])).toMatchObject({ kind: 'present', text: '', label: 'present' })
    expect(dayMark('2026-10-06', ctx, records['2026-10-06'])).toMatchObject({ kind: 'late', text: '18m', label: 'late or early, 18 minutes in total' })
    expect(dayMark('2026-10-08', ctx, records['2026-10-08'])).toMatchObject({ kind: 'leave', text: 'AL', label: 'annual leave' })
    expect(dayMark('2026-10-09', ctx, records['2026-10-09']).label).toBe('sick leave')
    expect(dayMark('2026-10-14', ctx, records['2026-10-14'])).toMatchObject({ kind: 'absent', text: 'A' })
  })
  it('puts weekends and holidays first, then future days, and shows nothing for a past day without a record', () => {
    expect(dayMark('2026-10-10', ctx, records['2026-10-05']).kind).toBe('weekend') // Saturday
    expect(dayMark('2026-10-15', ctx, { result: 'present' }).kind).toBe('holiday')
    expect(dayMark('2026-10-26', ctx, { result: 'present' }).kind).toBe('future')
    expect(dayMark('2026-10-12', ctx).kind).toBe('none')
  })
})

describe('summarize', () => {
  it('counts each result, adds late minutes and computes the attended share', () => {
    const keys = Array.from({ length: 31 }, (_, i) => `2026-10-${String(i + 1).padStart(2, '0')}`)
    const s = summarize(keys, records, ctx)
    expect(s).toMatchObject({ present: 2, late: 1, lateMinutes: 18, leave: 2, absent: 1, workingDays: 6 })
    expect(s.rate).toBe(50) // 3 of 6 attended
  })
  it('is all zero with no results', () => {
    expect(summarize(['2026-10-12'], {}, ctx)).toMatchObject({ workingDays: 0, rate: 0 })
  })
})

describe('<AttendanceCalendar>', () => {
  it('renders the month with a check, the codes, the minutes and the totals', () => {
    const html = renderToStaticMarkup(<AttendanceCalendar records={records} holidays={ctx.holidays} today={ctx.today} />)
    expect(html).toContain('October 2026')
    expect(html).toContain('aria-label="6 October 2026: late or early, 18 minutes in total"')
    expect(html).toContain('>18m<')
    expect(html).toContain('>AL<')
    expect(html).toContain('>SL<')
    expect(html).toContain('aria-label="15 October 2026: public holiday"')
    expect(html.match(/class="cal-day att/g)).toHaveLength(42)
    expect(html).toContain('18 min total')
  })
  it('renders the week with taller cells and weekday labels, and can hide the summary', () => {
    const html = renderToStaticMarkup(<AttendanceCalendar records={records} today={ctx.today} defaultView="week" showSummary={false} />)
    expect(html.match(/att-tall/g)?.length).toBeGreaterThanOrEqual(7)
    expect(html).toContain('19 to 25 Oct 2026')
    expect(html).not.toContain('att-sum')
  })
  it('has a key for every mark', () => {
    const html = renderToStaticMarkup(<AttendanceKey />)
    for (const t of ['Present', 'Annual leave', 'Unpaid leave', 'Sick leave', 'Absent', 'Holiday']) expect(html).toContain(t)
  })
})
