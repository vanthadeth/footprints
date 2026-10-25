import { describe, expect, it } from 'vitest'
import { buildOverview, buildPerformance, minutesOfText, type OverviewInput } from '../teamOverviewAdapter'
import type { FleetMemberSnapshot } from '@/features/fleet/types'

const at = (hhmm: string) => `2026-10-23T${hhmm}:00+07:00`
const member = (id: string, fullName: string) => ({ id, fullName, nickname: null, photoPath: null, position: null, roleName: null, managerId: null, isFieldSales: true, departmentId: null, departmentName: null })
const visit = (id: string, a: string, b: string | null, cancelled = false) => ({ id, checked_in_at: at(a), checked_out_at: b ? at(b) : null, cancelled_at: cancelled ? at(a) : null, flags: null }) as never
const snap = (id: string, name: string, sessions: [string, string | null][] = [], visits: ReturnType<typeof visit>[] = []): FleetMemberSnapshot =>
  ({
    member: member(id, name),
    status: 'OFF',
    attendance: null,
    sessions: sessions.map(([a, b]) => ({ clock_in_at: at(a), clock_out_at: b ? at(b) : null })) as never,
    openVisit: null,
    visitsToday: visits,
    lastLocation: null,
  }) as FleetMemberSnapshot

const base = (over: Partial<OverviewInput>): OverviewInput => ({
  snapshots: [],
  leave: {},
  workDays: {},
  defaults: { start: '08:00', end: '17:00' },
  graceMin: 5,
  forgottenCapMin: 120,
  now: Date.parse(at('13:40')),
  ...over,
})

describe('minutesOfText', () => {
  it('reads HH:MM and HH:MM:SS', () => {
    expect(minutesOfText('08:30')).toBe(510)
    expect(minutesOfText('17:00:00')).toBe(1020)
  })
})

describe('buildOverview', () => {
  it('puts a clock-in within the grace on time and counts later minutes from the start time', () => {
    const o = buildOverview(base({ snapshots: [snap('a', 'On Time', [['08:05', null]]), snap('b', 'Late One', [['08:25', null]]), snap('c', 'Early', [['07:50', null]])] }))
    expect(o.people.map((p) => [p.name, p.state, p.lateMinutes, p.clockIn])).toEqual([['On Time', 'in', 0, '08:05'], ['Late One', 'in', 25, '08:25'], ['Early', 'in', 0, '07:50']])
  })
  it("judges each person against their own shift", () => {
    const o = buildOverview(base({ snapshots: [snap('a', 'Afternoon', [['13:20', null]])], workDays: { a: { isWorking: true, start: '13:00', end: '21:00' } } }))
    expect(o.people[0]).toMatchObject({ state: 'in', lateMinutes: 20 })
  })
  it('lets a clock-in win over leave', () => {
    const o = buildOverview(base({ snapshots: [snap('a', 'Half Day', [['08:00', null]])], leave: { a: 'annual' } }))
    expect(o.people[0].state).toBe('in')
  })
  it('maps leave types to codes', () => {
    const o = buildOverview(base({ snapshots: [snap('a', 'A'), snap('b', 'B'), snap('c', 'C'), snap('d', 'D')], leave: { a: 'annual', b: 'sick', c: 'unpaid', d: 'flex' } }))
    expect(o.people.map((p) => p.leaveCode)).toEqual(['AL', 'SL', 'UL', 'FD'])
  })
  it('calls no clock-in absent only after the start time plus grace', () => {
    const s = [snap('a', 'Nobody')]
    expect(buildOverview(base({ snapshots: s, now: Date.parse(at('08:05')) })).people[0]).toMatchObject({ state: 'waiting', note: 'Starts at 08:00' })
    expect(buildOverview(base({ snapshots: s, now: Date.parse(at('08:06')) })).people[0].state).toBe('absent')
  })
  it('does not call a day off absent, and leaves day-off people out of the targets', () => {
    const o = buildOverview(base({ snapshots: [snap('a', 'Off'), snap('b', 'Works', [['08:00', null]])], workDays: { a: { isWorking: false, start: '08:00', end: '17:00' } } }))
    expect(o.people[0]).toMatchObject({ state: 'waiting', note: 'Day off' })
    expect(o.expectedIds).toEqual(['b'])
  })
  it('draws the strip up to now for someone still on the clock, and stops at the clock-out for someone who left', () => {
    const o = buildOverview(base({ snapshots: [snap('a', 'On', [['08:00', null]], [visit('v1', '09:00', '09:45'), visit('v2', '10:00', null), visit('x', '11:00', '11:30', true)]), snap('b', 'Out', [['08:00', '12:00']])] }))
    const on = o.people[0]
    expect(on.visits).toBe(2)
    expect(on.strip).toMatchObject({ clockIn: 480, clockOut: 13 * 60 + 40, now: 13 * 60 + 40, shiftStart: 480, shiftEnd: 1020 })
    expect(on.strip!.visits).toEqual([{ start: 540, end: 585 }, { start: 600, end: 13 * 60 + 40 }])
    expect(o.people[1].strip).toMatchObject({ clockOut: 720 })
  })
  it('takes the widest shift among the people expected to work', () => {
    const o = buildOverview(base({ snapshots: [snap('a', 'A', [['08:00', null]]), snap('b', 'B', [['10:00', null]])], workDays: { b: { isWorking: true, start: '10:00', end: '19:00' } } }))
    expect([o.shiftStart, o.shiftEnd, o.nowMinute]).toEqual([480, 1140, 820])
  })
})

describe('buildPerformance', () => {
  const overview = buildOverview(base({ snapshots: [snap('a', 'A', [['08:00', null]]), snap('b', 'B', [['08:00', null]]), snap('c', 'C')], leave: { c: 'annual' } }))
  const facts = {
    overview,
    visits: [{ id: 'v1' }, { id: 'v2' }, { id: 'v3' }],
    orderStates: { v1: 'synced', v2: 'pending', v3: 'unmatched' } as const,
    orderTotals: { v1: { totalUsd: 300 }, v2: { totalUsd: null }, v3: { totalUsd: 900 } },
    orderTargets: { a: 400, b: null },
    dailyOrderTargetUsd: 300,
    dailyVisitTarget: 10,
    newCustomers: 2,
  }
  it('adds up synced orders only, targets over the people expected to work, and visits against their target', () => {
    const p = buildPerformance({ ...facts, orderStates: { ...facts.orderStates } })
    expect(p.sales).toMatchObject({ value: 300, target: 700, percent: 43 })
    expect(p.visits).toMatchObject({ value: 3, target: 20, percent: 15 })
    expect(p.newCustomers).toMatchObject({ value: 2, target: null, percent: null })
  })
  it('puts the pace tick where the working day has got to', () => {
    const p = buildPerformance({ ...facts, orderStates: { ...facts.orderStates } })
    expect(p.sales.pace).toBeCloseTo((820 - 480) / 540 * 100, 5)
  })
  it('has no targets when nobody is expected to work', () => {
    const none = buildOverview(base({ snapshots: [snap('c', 'C')], leave: { c: 'annual' } }))
    const p = buildPerformance({ ...facts, overview: none, orderStates: { ...facts.orderStates } })
    expect(p.sales.target).toBeNull()
    expect(p.visits.target).toBeNull()
  })
})
