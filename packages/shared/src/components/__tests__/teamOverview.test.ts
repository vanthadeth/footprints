import { describe, expect, it } from 'vitest'
import { filterPeople, initials, leaveSplitText, measure, overviewKpis, paceTone, performance, sortPeople, type OverviewPerson } from '../teamOverview'
import { buildStrip, hm } from '../dayStrip'
import { PREVIEW_OVERVIEW, PREVIEW_PERFORMANCE } from '../../pages/componentsPreviewData'

const p = (o: Partial<OverviewPerson> & { name: string }): OverviewPerson => ({ id: o.name, state: 'in', lateMinutes: 0, ...o })

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
  it('colours by pace, not by percent', () => {
    expect(paceTone(2000, 5000, 0.4)).toBe('ok')
    expect(paceTone(1800, 5000, 0.4)).toBe('warn')
    expect(paceTone(1000, 5000, 0.4)).toBe('bad')
    expect(paceTone(0, 5000, 0)).toBe('ok')
  })
  it('gives the sample day: 86% of target, ahead of pace', () => {
    const perf = performance(PREVIEW_PERFORMANCE)
    expect(perf.sales).toMatchObject({ percent: 86, tone: 'ok', diff: 1152, chip: '$1,152 ahead of pace' })
    expect(perf.sales.pace).toBeCloseTo(62.96, 1)
    expect(perf.visits.percent).toBe(68)
    expect(perf.newCustomers.percent).toBe(50)
  })
  it('says behind pace in money, and no target plainly', () => {
    expect(performance({ ...PREVIEW_PERFORMANCE, sales: 1900 }).sales).toMatchObject({ tone: 'bad', chip: '$1,248 behind pace' })
    const none = performance({ ...PREVIEW_PERFORMANCE, salesTarget: null })
    expect(none.sales).toMatchObject({ tone: null, pace: null, diff: null, chip: 'No sales target set' })
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
