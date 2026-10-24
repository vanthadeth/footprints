import type { AttendanceRecord, LeaveCode } from '../components/attendance'
import type { Activity, RosterData } from '../components/roster'
import type { HistoryMonth, MonthProgress } from '../components/trophies'

const pad = (n: number) => String(n).padStart(2, '0')
const key = (d: number) => `2026-10-${pad(d)}`

/** Eight people in three departments, October 2026, today the 23rd and the 15th a public holiday. Sample data for the preview page only. */
const PEOPLE: { name: string; department: string; late?: Record<number, number>; leave?: Record<number, LeaveCode>; absent?: number[] }[] = [
  { name: 'Sok Dara', department: 'Sales', late: { 6: 18, 20: 12 } },
  { name: 'Chan Sreyneang', department: 'Sales', late: { 13: 25 }, leave: { 8: 'AL', 9: 'AL' } },
  { name: 'Heng Vuthy', department: 'Sales', late: { 20: 9 }, absent: [14] },
  { name: 'Kim Lyna', department: 'Merchandising', leave: { 19: 'SL' } },
  { name: 'Pich Rithy', department: 'Merchandising', late: { 6: 40, 13: 35, 22: 15 }, leave: { 21: 'UL' } },
  { name: 'Meas Sophea', department: 'Merchandising', late: { 16: 8 } },
  { name: 'Ly Bunna', department: 'Distribution', leave: { 12: 'AL', 13: 'AL', 14: 'AL' } },
  { name: 'Noun Chenda', department: 'Distribution', late: { 23: 20 }, absent: [7] },
]

/** A few live-data cases the plain set above does not have: flexible-day leave, half days, a flexible day off. Keyed "person index-day". */
const FLEX: Record<string, AttendanceRecord> = {
  '0-7': { result: 'leave', code: 'FD' },
  '1-21': { result: 'leave', code: 'AL', half: true },
  '3-12': { result: 'present', halfLeave: 'SL' },
  '6-22': { result: 'dayoff' },
}

export const PREVIEW_TODAY = key(23)
export const PREVIEW_HOLIDAYS = [key(15)]

export function previewRoster(): RosterData {
  const records: RosterData['records'] = {}
  const activity: NonNullable<RosterData['activity']> = {}
  PEOPLE.forEach((p, i) => {
    const id = `p${i}`
    records[id] = {}
    activity[id] = {}
    for (let d = 1; d <= 23; d++) {
      const dow = new Date(2026, 9, d).getDay()
      if (dow === 0 || dow === 6 || d === 15) continue
      const rec: AttendanceRecord = FLEX[`${i}-${d}`] ?? (p.leave?.[d] ? { result: 'leave', code: p.leave[d] } : p.absent?.includes(d) ? { result: 'absent' } : p.late?.[d] ? { result: 'late', minutes: p.late[d] } : { result: 'present' })
      records[id][key(d)] = rec
      if (rec.result === 'present' || rec.result === 'late') {
        const visits = 4 + ((i * 5 + d * 3) % 5)
        const a: Activity = { visits, orders: { count: 1 + (d % 2), amount: visits * 47 }, collection: { count: d % 3 === 0 ? 1 : 0, amount: d % 3 === 0 ? 230 : 0 }, appointments: d % 3 }
        activity[id][key(d)] = a
      }
    }
  })
  return {
    today: PREVIEW_TODAY,
    holidays: PREVIEW_HOLIDAYS,
    people: PEOPLE.map((p, i) => ({ id: `p${i}`, name: p.name, department: p.department })),
    records,
    activity,
  }
}

/** October so far: sales and attendance at silver, new customers at gold, visits and system master still to go. */
export const PREVIEW_TROPHIES: MonthProgress = {
  sales: { actual: 5040, target: 6000 },
  visits: { actual: 102, target: 176 },
  newcustomer: { actual: 6, target: 6 },
  attendance: { actual: 95, lates: [12] },
  system: { actual: 71 },
}

type M = [HistoryMonth['medals'][number]['id'], 'gold' | 'silver']
const month = (label: string, medals: M[], inProgress = false): HistoryMonth => ({ label, inProgress, medals: medals.map(([id, tier]) => ({ id, tier })) })

/** The last 12 months of trophies, October still in progress. */
export const PREVIEW_HISTORY: HistoryMonth[] = [
  month('October 2026', [['sales', 'silver'], ['newcustomer', 'gold'], ['attendance', 'silver']], true),
  month('September 2026', [['sales', 'gold'], ['visits', 'silver'], ['newcustomer', 'gold'], ['attendance', 'gold'], ['system', 'gold']]),
  month('August 2026', [['sales', 'silver'], ['visits', 'silver'], ['attendance', 'gold']]),
  month('July 2026', [['visits', 'silver'], ['newcustomer', 'gold']]),
  month('June 2026', [['sales', 'silver'], ['attendance', 'silver'], ['system', 'gold']]),
  month('May 2026', [['sales', 'gold'], ['visits', 'gold'], ['attendance', 'silver']]),
  month('April 2026', [['attendance', 'gold']]),
  month('March 2026', [['sales', 'silver'], ['visits', 'silver'], ['newcustomer', 'gold'], ['attendance', 'silver']]),
  month('February 2026', []),
  month('January 2026', [['sales', 'silver'], ['attendance', 'gold']]),
  month('December 2025', [['visits', 'silver'], ['newcustomer', 'gold'], ['system', 'gold']]),
  month('November 2025', [['sales', 'silver']]),
]

/** Last month's medals for the card footer: September in the history above. */
export const PREVIEW_LAST_MONTH = { name: 'September', medals: PREVIEW_HISTORY[1].medals }
