import type { AttendanceRecord, LeaveCode } from '../components/attendance'
import type { Activity, RosterData } from '../components/roster'

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
      const rec: AttendanceRecord = p.leave?.[d] ? { result: 'leave', code: p.leave[d] } : p.absent?.includes(d) ? { result: 'absent' } : p.late?.[d] ? { result: 'late', minutes: p.late[d] } : { result: 'present' }
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
