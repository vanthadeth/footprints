import { describe, expect, it } from 'vitest'
import { buildRoster, dayList, money, monthDays, teamKpis, teamSummary, weekDays, type RosterData } from '../roster'

const days = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08'] // Mon-Thu
const act = (visits: number, amount: number) => ({ visits, orders: { count: 1, amount }, collection: { count: 0, amount: 0 }, appointments: 1 })
const data: RosterData = {
  today: '2026-10-23',
  holidays: [],
  people: [
    { id: 'a', name: 'Sok Dara', department: 'Sales' },
    { id: 'b', name: 'Kim Lyna', department: 'Merchandising' },
    { id: 'c', name: 'Chan Sreyneang', department: 'Sales' },
  ],
  records: {
    a: { '2026-10-05': { result: 'present' }, '2026-10-06': { result: 'late', minutes: 18 }, '2026-10-07': { result: 'present' }, '2026-10-08': { result: 'absent' } },
    b: { '2026-10-05': { result: 'leave', code: 'AL' }, '2026-10-06': { result: 'leave', code: 'AL' }, '2026-10-07': { result: 'present' }, '2026-10-08': { result: 'present' } },
    c: { '2026-10-05': { result: 'present' }, '2026-10-06': { result: 'present' }, '2026-10-07': { result: 'late', minutes: 7 }, '2026-10-08': { result: 'present' } },
  },
  activity: {
    a: { '2026-10-05': act(5, 200), '2026-10-06': act(4, 100) },
    c: { '2026-10-05': act(6, 300) },
  },
}

describe('buildRoster', () => {
  it('groups people by department in order of first appearance', () => {
    const g = buildRoster(data, days, 'attendance', 'month')
    expect(g.map((x) => [x.name, x.rows.map((r) => r.person.name)])).toEqual([
      ['Sales', ['Sok Dara', 'Chan Sreyneang']],
      ['Merchandising', ['Kim Lyna']],
    ])
  })
  it('writes the attendance marks into the cells and totals each row', () => {
    const [sales] = buildRoster(data, days, 'attendance', 'month')
    const row = sales.rows[0]
    expect(row.cells.map((c) => [c.kind, c.text, c.check])).toEqual([['present', '', true], ['late', '18m', false], ['present', '', true], ['absent', 'A', false]])
    expect(row.summary).toMatchObject({ present: 2, late: 1, lateMinutes: 18, leave: 0, absent: 1, workingDays: 4 })
    expect(row.cells[1].label).toBe('Sok Dara, 6 October 2026: late or early, 18 minutes in total')
  })
  it('in activity mode shows a dot for a day with visits, and visits with the order amount in the week', () => {
    const month = buildRoster(data, days, 'activity', 'month')[0].rows[0].cells
    expect(month.map((c) => c.dot)).toEqual([true, true, false, false])
    expect(month.every((c) => !c.check && c.text === '')).toBe(true)
    const week = buildRoster(data, days, 'activity', 'week')[0].rows[0].cells
    expect(week[0].text).toBe('5 · $200')
    expect(week[2].text).toBe('') // present, no activity recorded
    expect(week[3].text).toBe('') // absent
  })
})

describe('team numbers', () => {
  const groups = buildRoster(data, days, 'attendance', 'month')
  it('adds the rows up and computes the attendance rate', () => {
    expect(teamSummary(groups)).toMatchObject({ present: 7, late: 2, lateMinutes: 25, leave: 2, absent: 1, workingDays: 12, rate: 75 })
  })
  it('has four tiles in attendance mode and five in activity mode', () => {
    const targets = { visits: 8, orders: 300 }
    const a = teamKpis(groups, data, days, 'attendance', targets)
    expect(a.map((k) => k.label)).toEqual(['Attendance', 'Late or early', 'Leave days', 'Absent days'])
    expect(a[1]).toMatchObject({ value: '2', sub: '25 min in total' })
    const v = teamKpis(buildRoster(data, days, 'activity', 'month'), data, days, 'activity', targets)
    expect(v).toHaveLength(5)
    expect(v[3]).toMatchObject({ label: 'Visits vs target', sub: '15 of 72' }) // 9 attended person-days x 8
    expect(v[4].value).toBe('$600')
  })
})

describe('dayList', () => {
  it('counts the day, labels each person and totals the activity of those who attended', () => {
    const d = dayList(data, '2026-10-06', { visits: 8, orders: 300 })
    expect(d.counts).toEqual({ present: 1, late: 1, leave: 1, absent: 0 })
    expect(d.people.map((p) => p.chip)).toEqual(['Late 18m', 'Annual leave', 'On time'])
    expect(d.totals).toMatchObject({ visits: 4, visitTarget: 16, appointments: 1 })
    expect(d.totals.orders).toEqual({ count: 1, amount: 100 })
  })
  it('labels weekends and holidays', () => {
    expect(dayList(data, '2026-10-10', { visits: 8, orders: 300 }).people[0].chip).toBe('Weekend')
    expect(dayList({ ...data, holidays: ['2026-10-15'] }, '2026-10-15', { visits: 8, orders: 300 }).people[0].chip).toBe('Holiday')
  })
})

describe('days', () => {
  it('lists the days of a month and of a week', () => {
    expect(monthDays('2026-10-23')).toHaveLength(31)
    expect(monthDays('2026-02-10')).toHaveLength(28)
    expect(weekDays('2026-10-26')).toEqual(['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01'])
  })
})

describe('new record kinds in the roster', () => {
  const people = [{ id: 'a', name: 'Sok Dara', department: 'Sales' }]
  const d = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10']
  const live: RosterData = {
    today: '2026-10-23',
    people,
    records: {
      a: {
        '2026-10-05': { result: 'leave', code: 'FD' },
        '2026-10-06': { result: 'leave', code: 'AL', half: true },
        '2026-10-07': { result: 'present', halfLeave: 'SL' },
        '2026-10-08': { result: 'dayoff' },
        '2026-10-09': { result: 'holiday' },
        '2026-10-10': { result: 'present' }, // a Saturday someone worked
      },
    },
  }
  it('writes FD, the half flag, the day-off dash, the holiday and a worked Saturday into the cells', () => {
    const cells = buildRoster(live, d, 'attendance', 'month')[0].rows[0].cells
    expect(cells.map((c) => [c.kind, c.text, c.half, c.check])).toEqual([
      ['leave', 'FD', false, false],
      ['leave', 'AL', true, false],
      ['present', '', true, true],
      ['dayoff', '–', false, false],
      ['holiday', '', false, false],
      ['present', '', false, true],
    ])
    expect(cells[3].label).toBe('Sok Dara, 8 October 2026: day off')
  })
  it('does not count a day off, a holiday or a half-day leave on a clocked-in day as anything but attended', () => {
    const [g] = buildRoster(live, d, 'attendance', 'month')
    expect(g.rows[0].summary).toMatchObject({ present: 2, leave: 2, absent: 0, workingDays: 4 })
  })
  it('labels the day-list chips for the new cases', () => {
    const chip = (key: string) => dayList(live, key, { visits: 8, orders: 300 }).people[0].chip
    expect(chip('2026-10-05')).toBe('Flexible day off')
    expect(chip('2026-10-06')).toBe('Annual leave ½')
    expect(chip('2026-10-07')).toBe('On time ½')
    expect(chip('2026-10-08')).toBe('Day off')
    expect(dayList(live, '2026-10-08', { visits: 8, orders: 300 }).counts).toEqual({ present: 0, late: 0, leave: 0, absent: 0 })
  })
})

describe('money', () => {
  it('writes whole dollars with thousands separators, rounding a share of a monthly target', () => {
    expect(money(1181.818)).toBe('$1,182')
    expect(money(74300)).toBe('$74,300')
    expect(money(0)).toBe('$0')
  })
})
