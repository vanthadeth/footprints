import { describe, expect, it } from 'vitest'
import { filterPeople, groupByDepartment, infoPills, initials, leaveSplitText, measure, overviewKpis, paceTone, performance, sortPeople, statusChip, statusLine, type OverviewPerson } from '../teamOverview'
import { buildStrip, hm } from '../dayStrip'
import { PREVIEW_OVERVIEW, PREVIEW_PERFORMANCE } from '../../pages/componentsPreviewData'

const p = (o: Partial<OverviewPerson> & { name: string }): OverviewPerson => ({ id: o.name, department: 'Sales', state: 'in', lateMinutes: 0, ...o })

describe('overviewKpis', () => {
  const k = overviewKpis(PREVIEW_OVERVIEW)
  it('counts clocked in, on leave and absent so they add up to the team', () => {
    expect([k.total, k.clockedIn, k.onLeave, k.absent]).toEqual([9, 6, 2, 1])
  })
  it('counts late people and their minutes; late is a subset of clocked in', () => {
    expect([k.late, k.lateMinutes]).toEqual([3, 67])
    expect(k.late).toBeLessThanOrEqual(k.clockedIn)
  })
  it('splits leave by type, only the types that occur', () => {
    expect(leaveSplitText(k)).toBe('AL 1 · SL 1')
    expect(leaveSplitText(overviewKpis([]))).toBe('')
  })
})

describe('sortPeople and filterPeople', () => {
  it('puts absent first, then late by most minutes, then clocked in, then on leave, by name within each', () => {
    expect(sortPeople(PREVIEW_OVERVIEW).map((x) => x.name)).toEqual(['Heng Vuthy', 'Pich Rithy', 'Chan Sreyneang', 'Noun Chenda', 'Meas Sophea', 'Sok Dara', 'Srey Pov', 'Kim Lyna', 'Ly Bunna'])
  })
  it('filters by state, and late is a view of the clocked-in people', () => {
    expect(filterPeople(PREVIEW_OVERVIEW, 'all')).toHaveLength(9)
    expect(filterPeople(PREVIEW_OVERVIEW, 'in')).toHaveLength(6)
    expect(filterPeople(PREVIEW_OVERVIEW, 'leave').map((x) => x.leaveCode)).toEqual(['SL', 'AL'])
    expect(filterPeople(PREVIEW_OVERVIEW, 'absent').map((x) => x.name)).toEqual(['Heng Vuthy'])
    expect(filterPeople(PREVIEW_OVERVIEW, 'late').map((x) => x.name).sort()).toEqual(['Chan Sreyneang', 'Noun Chenda', 'Pich Rithy'])
  })
  it('keeps people who are not due yet or on a day off out of every tile but in the team', () => {
    const list = [p({ name: 'Early', state: 'waiting', note: 'Starts at 08:00' }), p({ name: 'Ann' }), p({ name: 'Zed', state: 'leave', leaveCode: 'AL' })]
    expect(overviewKpis(list)).toMatchObject({ total: 3, clockedIn: 1, onLeave: 1, absent: 0, late: 0 })
    expect(sortPeople(list).map((x) => x.name)).toEqual(['Ann', 'Early', 'Zed'])
    for (const f of ['in', 'leave', 'absent', 'late'] as const) expect(filterPeople(list, f).map((x) => x.name)).not.toContain('Early')
  })
  it('does not change the input order', () => {
    const list = [p({ name: 'B', state: 'leave' }), p({ name: 'A' })]
    sortPeople(list)
    expect(list.map((x) => x.name)).toEqual(['B', 'A'])
  })
})

describe('initials', () => {
  it('uses the first and last word', () => {
    expect(initials('Sok Dara')).toBe('SD')
    expect(initials('Madonna')).toBe('M')
    expect(initials('  ')).toBe('?')
  })
})

describe('measure and performance', () => {
  it('rounds the percent and caps the bar at 100', () => {
    expect(measure(27, 40)).toEqual({ value: 27, target: 40, percent: 68, fill: 68 })
    expect(measure(60, 40)).toMatchObject({ percent: 150, fill: 100 })
  })
  it('has no percent or bar without a target', () => {
    expect(measure(3, null)).toEqual({ value: 3, target: null, percent: null, fill: 0 })
    expect(measure(3, 0).target).toBeNull()
  })
  it('gives the sample day: 86% of target, 68% of the visit target, half of the new customers', () => {
    const perf = performance(PREVIEW_PERFORMANCE)
    expect(perf.sales).toMatchObject({ value: 4300, target: 5000, percent: 86, fill: 86 })
    expect(perf.visits.percent).toBe(68)
    expect(perf.newCustomers.percent).toBe(50)
  })
  it('has no pace on the day: pace belongs to the month', () => {
    expect(Object.keys(performance(PREVIEW_PERFORMANCE).sales).sort()).toEqual(['fill', 'percent', 'target', 'value'])
  })
  it('colours by pace, not by percent', () => {
    expect(paceTone(2000, 5000, 0.4)).toBe('ok')
    expect(paceTone(1800, 5000, 0.4)).toBe('warn')
    expect(paceTone(1000, 5000, 0.4)).toBe('bad')
    expect(paceTone(0, 5000, 0)).toBe('ok')
  })
  it('gives the month: 68% of target, 17 of 22 working days gone, amber, behind pace by money', () => {
    const m = performance(PREVIEW_PERFORMANCE).month!
    expect(m.sales).toMatchObject({ value: 74300, target: 110000, percent: 68, tone: 'warn', diff: -10700, chip: '$10,700 behind pace' })
    expect(m.sales.pace).toBeCloseTo((17 / 22) * 100, 5)
    expect(m.visits).toMatchObject({ value: 482, target: 880, percent: 55 })
    expect(m.newCustomers).toMatchObject({ value: 11, target: 24, percent: 46 })
    expect(m.daysLeft).toBe(5)
  })
  it('turns red when well behind, green when ahead', () => {
    const at = (sales: number) => performance({ ...PREVIEW_PERFORMANCE, month: { ...PREVIEW_PERFORMANCE.month!, sales } }).month!.sales
    expect(at(52000)).toMatchObject({ tone: 'bad', chip: '$33,000 behind pace' })
    expect(at(96000)).toMatchObject({ tone: 'ok', chip: '$11,000 ahead of pace' })
  })
  it('has no month when none is given, and no judgement without a target or working days', () => {
    expect(performance({ ...PREVIEW_PERFORMANCE, month: undefined }).month).toBeNull()
    const none = performance({ ...PREVIEW_PERFORMANCE, month: { ...PREVIEW_PERFORMANCE.month!, salesTarget: null } }).month!
    expect(none.sales).toMatchObject({ target: null, tone: null, diff: null, chip: 'No target set' })
    const noDays = performance({ ...PREVIEW_PERFORMANCE, month: { ...PREVIEW_PERFORMANCE.month!, doneDays: 0, totalDays: 0 } }).month!
    expect(noDays.sales).toMatchObject({ pace: null, tone: null })
    expect(noDays.daysLeft).toBe(0)
  })
  it('shows only the numbers when there is no target', () => {
    expect(performance({ ...PREVIEW_PERFORMANCE, salesTarget: null }).sales).toEqual({ value: 4300, target: null, percent: null, fill: 0 })
  })
})

describe('groupByDepartment', () => {
  it('groups by department alphabetically with "No department" last, and sorts inside each group', () => {
    const people = [p({ name: 'Zed', department: 'No department' }), p({ name: 'Bo', department: 'Sales' }), p({ name: 'Al', department: 'Distribution', state: 'leave', leaveCode: 'AL' }), p({ name: 'Cy', department: 'Distribution' }), p({ name: 'Di', department: 'Sales', state: 'absent' })]
    expect(groupByDepartment(people).map((g) => [g.name, g.people.map((x) => x.name)])).toEqual([['Distribution', ['Cy', 'Al']], ['Sales', ['Di', 'Bo']], ['No department', ['Zed']]])
  })
  it('treats an empty department as none', () => {
    expect(groupByDepartment([p({ name: 'A', department: '' })])[0].name).toBe('No department')
  })
  it('has no groups for no people', () => {
    expect(groupByDepartment([])).toEqual([])
  })
})

describe('statusLine, statusChip and infoPills', () => {
  it('words every state', () => {
    expect([statusLine(p({ name: 'A', clockIn: '08:25', lateMinutes: 25 })), statusChip(p({ name: 'A', lateMinutes: 25 }))]).toEqual(['Clocked in 08:25', { text: 'Late 25m', tone: 'amb' }])
    expect(statusChip(p({ name: 'A' }))).toEqual({ text: 'On time', tone: 'ok' })
    expect([statusLine(p({ name: 'A', state: 'leave', leaveCode: 'SL' })), statusChip(p({ name: 'A', state: 'leave', leaveCode: 'SL' }))]).toEqual(['Sick leave', { text: 'On leave · SL', tone: 'mu' }])
    expect([statusLine(p({ name: 'A', state: 'absent' })), statusChip(p({ name: 'A', state: 'absent' }))]).toEqual(['No clock-in yet', { text: 'Absent', tone: 'bad' }])
    expect([statusLine(p({ name: 'A', state: 'waiting', note: 'Starts at 08:00' })), statusChip(p({ name: 'A', state: 'waiting', note: 'Starts at 08:00' })).text]).toEqual(['Starts at 08:00', 'Not due yet'])
    expect(statusChip(p({ name: 'A', state: 'waiting', note: 'Day off' }))).toEqual({ text: 'Day off', tone: 'mu' })
  })
  it('writes the three pills, singular for one', () => {
    expect(infoPills({ uniqueVisits: 5, orders: 3, amountUsd: 820 })).toEqual([{ text: '5 unique visits' }, { text: '3 orders' }, { text: '$820', amount: true }])
    expect(infoPills({ uniqueVisits: 1, orders: 1, amountUsd: 0 }).map((x) => x.text)).toEqual(['1 unique visit', '1 order', '$0'])
  })
})

describe('a day in progress on the strip', () => {
  const day = { shiftStart: hm('08:00'), shiftEnd: hm('17:00'), clockIn: hm('08:00'), clockOut: hm('13:00'), now: hm('13:00'), visits: [{ start: hm('09:00'), end: hm('10:00') }] }
  it('draws nothing after now', () => {
    const segs = buildStrip(day, 7 * 60, 19 * 60)
    expect(Math.max(...segs.map((s) => s.left + s.width))).toBeCloseTo(((13 * 60 - 7 * 60) / (12 * 60)) * 100, 5)
  })
  it('without now it still marks the rest of the shift as not clocked in', () => {
    const segs = buildStrip({ ...day, now: undefined }, 7 * 60, 19 * 60)
    expect(segs[segs.length - 1].kind).toBe('missed')
  })
})
