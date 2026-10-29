import { describe, expect, it } from 'vitest'
import { dayAlerts } from '../dayAlerts'
import type { AttendanceRow, VisitRow } from '@/features/attendance/types'

const day = '2026-10-23'
const at = (hm: string) => `${day}T${hm}:00+07:00`
const ms = (hm: string) => new Date(at(hm)).getTime()
const att = (inHm: string, outHm: string | null, flags: string[] = []) => ({ clock_in_at: at(inHm), clock_out_at: outHm ? at(outHm) : null, flags }) as unknown as AttendanceRow
const visit = (hm: string) => ({ checked_in_at: at(hm), cancelled_at: null }) as unknown as VisitRow
const base = { day, workStart: '08:00', workEnd: '17:00', graceMin: 10, firstVisitDeadline: '10:00', clock: (n: number) => String(new Date(n).toISOString().slice(11, 16)) }
const ids = (a: ReturnType<typeof dayAlerts>) => a.map((x) => x.id)

describe('dayAlerts', () => {
  it('has nothing before clock-in', () => {
    expect(dayAlerts({ ...base, now: ms('09:00'), attendance: [], visits: [] })).toEqual([])
  })
  it('flags a late clock-in past the grace period only', () => {
    expect(ids(dayAlerts({ ...base, now: ms('09:00'), attendance: [att('08:23', null)], visits: [visit('08:40')] }))).toEqual(['late_in'])
    expect(dayAlerts({ ...base, now: ms('09:00'), attendance: [att('08:09', null)], visits: [visit('08:40')] })).toEqual([])
  })
  it('flags a clock-out before the end of the shift, not while still clocked in', () => {
    expect(ids(dayAlerts({ ...base, now: ms('18:00'), attendance: [att('08:00', '14:20')], visits: [visit('09:00')] }))).toEqual(['early_out'])
    expect(dayAlerts({ ...base, now: ms('13:00'), attendance: [att('08:00', null)], visits: [visit('09:00')] })).toEqual([])
    expect(dayAlerts({ ...base, now: ms('18:00'), attendance: [att('08:00', '17:05')], visits: [visit('09:00')] })).toEqual([])
  })
  it('flags a late first visit, and no visit past the deadline while clocked in', () => {
    expect(ids(dayAlerts({ ...base, now: ms('12:00'), attendance: [att('08:00', null)], visits: [visit('10:42')] }))).toEqual(['late_first_visit'])
    expect(ids(dayAlerts({ ...base, now: ms('10:30'), attendance: [att('08:00', null)], visits: [] }))).toEqual(['no_first_visit'])
    expect(dayAlerts({ ...base, now: ms('09:30'), attendance: [att('08:00', null)], visits: [] })).toEqual([])
  })
})
