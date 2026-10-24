import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { addDays, addMonths, buildAgenda, buildMonth, buildWeek, longDate, monthLabel, startOfWeek, weekdayNames, weekLabel } from '../calendar'
import { Calendar } from '../Calendar'

const opts = { today: '2026-10-23' }

describe('buildMonth', () => {
  it('is six weeks of seven, starting on the week start before the 1st', () => {
    const mon = buildMonth('2026-10-15', 'mon', opts)
    expect(mon).toHaveLength(42)
    expect(mon[0].key).toBe('2026-09-28') // 1 Oct 2026 is a Thursday
    const sun = buildMonth('2026-10-15', 'sun', opts)
    expect(sun[0].key).toBe('2026-09-27')
    expect(weekdayNames('sun')[0]).toBe('SUN')
    expect(weekdayNames('mon')[0]).toBe('MON')
  })
  it('flags other-month days, weekends, today and the selected day (selected is separate from today)', () => {
    const cells = buildMonth('2026-10-15', 'mon', { ...opts, selected: '2026-10-23' })
    expect(cells[0].inMonth).toBe(false)
    expect(cells.find((c) => c.key === '2026-10-24')?.weekend).toBe(true)
    const c = cells.find((x) => x.key === '2026-10-23')!
    expect(c.today && c.selected).toBe(true)
  })
  it('disables dates inside a range, inclusive', () => {
    const cells = buildMonth('2026-10-15', 'mon', { ...opts, disabled: [{ from: '2026-10-30', to: '2026-10-31' }] })
    expect(cells.filter((c) => c.disabled).map((c) => c.key)).toEqual(['2026-10-30', '2026-10-31'])
  })
  it('turns marks into a background and dots; a holiday beats attendance; other months carry none', () => {
    const marks = {
      '2026-10-15': { holiday: true, attendance: 'late' as const },
      '2026-10-14': { attendance: 'absent' as const },
      '2026-10-08': { attendance: 'leave' as const },
      '2026-10-06': { attendance: 'late' as const, appointment: true, visit: true },
      '2026-09-30': { attendance: 'late' as const, visit: true },
    }
    const by = (k: string) => buildMonth('2026-10-15', 'mon', { ...opts, marks }).find((c) => c.key === k)!
    expect(by('2026-10-15').background).toBe('holiday')
    expect(by('2026-10-14').background).toBe('absent')
    expect(by('2026-10-08').background).toBe('leave')
    expect(by('2026-10-06').background).toBe('late')
    expect(by('2026-10-06').dots).toEqual(['appointment', 'visit'])
    expect(by('2026-09-30').background).toBeNull()
    expect(by('2026-09-30').dots).toEqual([])
  })
})

describe('week, agenda and labels', () => {
  it('builds the week that contains a date', () => {
    expect(startOfWeek('2026-10-23', 'mon')).toBe('2026-10-19')
    expect(startOfWeek('2026-10-23', 'sun')).toBe('2026-10-18')
    expect(buildWeek('2026-10-23', 'mon', opts).map((c) => c.weekday)).toEqual(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'])
  })
  it('lists consecutive days for the agenda', () => {
    const a = buildAgenda('2026-10-30', 3, opts)
    expect(a.map((c) => c.key)).toEqual(['2026-10-30', '2026-10-31', '2026-11-01'])
  })
  it('shifts and labels', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-01')
    expect(monthLabel('2026-10-23')).toBe('October 2026')
    expect(weekLabel('2026-10-19')).toBe('19 to 25 Oct 2026')
    expect(weekLabel('2026-09-28')).toBe('28 Sep to 4 Oct 2026')
    expect(weekLabel('2026-12-28')).toBe('28 Dec 2026 to 3 Jan 2027')
    expect(longDate('2026-10-27')).toBe('27 October 2026')
  })
})

describe('<Calendar>', () => {
  it('renders the month with a name per day, the selected day pressed and today marked', () => {
    const html = renderToStaticMarkup(<Calendar today="2026-10-23" value="2026-10-27" />)
    expect(html).toContain('October 2026')
    expect(html).toContain('aria-label="27 October 2026" aria-pressed="true"')
    expect(html).toContain('aria-current="date"')
    expect(html.match(/class="cal-day/g)).toHaveLength(42)
  })
  it('renders week and agenda views, with the agenda placeholder or custom entries', () => {
    const week = renderToStaticMarkup(<Calendar today="2026-10-23" defaultView="week" />)
    expect(week).toContain('19 to 25 Oct 2026')
    expect(week.match(/class="cal-day/g)).toHaveLength(7)
    const agenda = renderToStaticMarkup(<Calendar today="2026-10-23" defaultView="agenda" agendaDays={3} />)
    expect(agenda.match(/Nothing planned/g)).toHaveLength(3)
    expect(renderToStaticMarkup(<Calendar today="2026-10-23" defaultView="agenda" agendaDays={1} renderAgendaEntries={() => 'Call Sok'} />)).toContain('Call Sok')
  })
  it('disables cells in a disabled range and shows the view switch only when asked', () => {
    const html = renderToStaticMarkup(<Calendar today="2026-10-23" disabled={[{ from: '2026-10-31', to: '2026-10-31' }]} showViewSwitch />)
    expect(html).toMatch(/cal-dis[^>]*disabled=""[^>]*aria-label="31 October 2026"|aria-label="31 October 2026"[^>]*disabled=""/)
    expect(html).toContain('role="tablist"')
    expect(renderToStaticMarkup(<Calendar today="2026-10-23" />)).not.toContain('tablist')
  })
})
