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
  it('lets a record decide the day, including a working Saturday and a person-level holiday or day off', () => {
    expect(dayMark('2026-10-10', ctx, { result: 'present' }).kind).toBe('present') // a Saturday someone worked
    expect(dayMark('2026-10-10', ctx, { result: 'absent' }).kind).toBe('absent')
    expect(dayMark('2026-10-12', ctx, { result: 'holiday' })).toMatchObject({ kind: 'holiday', label: 'public holiday' })
    expect(dayMark('2026-10-11', ctx, { result: 'off' }).kind).toBe('weekend')
    expect(dayMark('2026-10-12', ctx, { result: 'dayoff' })).toMatchObject({ kind: 'dayoff', text: '–', label: 'day off' })
  })
  it('without a record falls back to the weekend, the holiday list, the future, or nothing', () => {
    expect(dayMark('2026-10-10', ctx).kind).toBe('weekend') // Saturday
    expect(dayMark('2026-10-11', ctx).kind).toBe('weekend') // Sunday
    expect(dayMark('2026-10-15', ctx).kind).toBe('holiday')
    expect(dayMark('2026-10-26', ctx).kind).toBe('future')
    expect(dayMark('2026-10-12', ctx).kind).toBe('none')
  })
  it('shows flexible-day leave as FD and half days with a half flag, with or without a clock-in', () => {
    expect(dayMark('2026-10-12', ctx, { result: 'leave', code: 'FD' })).toMatchObject({ kind: 'leave', text: 'FD', half: false, label: 'flexible day off' })
    expect(dayMark('2026-10-12', ctx, { result: 'leave', code: 'AL', half: true })).toMatchObject({ text: 'AL', half: true, label: 'half-day annual leave' })
    expect(dayMark('2026-10-12', ctx, { result: 'present', halfLeave: 'SL' })).toMatchObject({ kind: 'present', half: true, label: 'present, half-day sick leave' })
    expect(dayMark('2026-10-12', ctx, { result: 'late', minutes: 18, halfLeave: 'AL' })).toMatchObject({ kind: 'late', text: '18m', half: true })
    expect(dayMark('2026-10-12', ctx, { result: 'present' }).half).toBe(false)
  })
})

describe('summarize', () => {
  it('counts each result, adds late minutes and computes the attended share', () => {
    const keys = Array.from({ length: 31 }, (_, i) => `2026-10-${String(i + 1).padStart(2, '0')}`)
    const s = summarize(keys, records, ctx)
    expect(s).toMatchObject({ present: 2, late: 1, lateMinutes: 18, leave: 2, absent: 1, workingDays: 6 })
    expect(s.rate).toBe(50) // 3 of 6 attended
  })
  it('does not count a day off, a holiday or a day that is not scheduled', () => {
    const recs: Record<string, AttendanceRecord> = { '2026-10-05': { result: 'present' }, '2026-10-06': { result: 'dayoff' }, '2026-10-07': { result: 'holiday' }, '2026-10-08': { result: 'off' }, '2026-10-09': { result: 'present', halfLeave: 'AL' } }
    expect(summarize(Object.keys(recs), recs, ctx)).toMatchObject({ present: 2, workingDays: 2, rate: 100 })
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
