import { provinceEnglish } from '@/features/customers/provinces'

/**
 * Sales trips: a start date and days. Each day visits provinces in order and
 * ends with an overnight province, or back in Phnom Penh on the last day.
 * Pure helpers shared by the request, review, detail and approval screens --
 * the database (0103) re-checks the rules and re-costs the trip on send.
 */

/** Provincial capitals (lat, lng) for the road-distance estimate; codes match geo_provinces. */
const CAPITAL: Record<string, [number, number]> = {
  PNH: [11.556, 104.928],
  KND: [11.483, 104.95],
  KSP: [11.457, 104.52],
  KCN: [12.25, 104.667],
  PRV: [11.484, 105.325],
  TKO: [10.99, 104.785],
  KMP: [10.61, 104.18],
  KEP: [10.483, 104.317],
  KPS: [10.627, 103.522],
  KKG: [11.617, 102.983],
  KCM: [11.993, 105.464],
  TKM: [11.91, 105.65],
  SVR: [11.087, 105.8],
  KTR: [12.488, 106.019],
  MDK: [12.454, 107.188],
  KTM: [12.711, 104.889],
  PVH: [13.807, 104.98],
  STR: [13.525, 105.968],
  RTK: [13.739, 106.987],
  PST: [12.538, 103.919],
  BTB: [13.095, 103.202],
  PLN: [12.849, 102.609],
  BMC: [13.585, 102.973],
  SRP: [13.362, 103.86],
  ODM: [14.181, 103.517],
}

export const HOME = 'PNH'

/** Every province a trip can visit (Phnom Penh is home, not a stop). */
export const TRIP_PROVINCES: string[] = Object.keys(CAPITAL).filter((c) => c !== HOME)

export function provinceName(code: string): string {
  return provinceEnglish(code, code)
}

/** Road distance ≈ straight line × 1.2 between provincial capitals, rounded to 5 km. */
export function km(a: string, b: string): number {
  if (a === b) return 0
  const p = CAPITAL[a]
  const q = CAPITAL[b]
  if (!p || !q) return 0
  const r = Math.PI / 180
  const x = (q[1] - p[1]) * r * Math.cos(((p[0] + q[0]) / 2) * r)
  const y = (q[0] - p[0]) * r
  return Math.round((Math.sqrt(x * x + y * y) * 6371 * 1.2) / 5) * 5
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** "Mon 5 Oct". */
export function dayLabel(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z')
  return `${DOW[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`
}

/** One day as edited: provinces in visit order, overnight (null = back to Phnom Penh), rooms (null = default). */
export interface TripDayInput {
  provinces: string[]
  night: string | null
  rooms: number | null
}

export interface PlannedDay extends TripDayInput {
  n: number
  date: string
  label: string
  from: string
  km: number
  back: boolean
  /** Which night in a row at this province (2 = second night there). */
  nightN: number
}

export interface TripPlan {
  start: string
  end: string
  days: PlannedDay[]
  provinces: string[]
  totalKm: number
  nightCount: number
  longest: PlannedDay | null
  back: boolean
  range: string
  length: string
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

export function lengthLabel(days: number, nights: number): string {
  return `${plural(days, 'day')}, ${plural(nights, 'night')}`
}

/** Dates, legs and totals: each day starts where the last one slept (Phnom Penh on day 1). */
export function planTrip(start: string, days: TripDayInput[]): TripPlan {
  let from = HOME
  const nightsAt: Record<string, number> = {}
  const out = days.map((d, i) => {
    const date = addDays(start, i)
    const stops = [from, ...d.provinces, d.night ?? HOME]
    let dist = 0
    for (let j = 1; j < stops.length; j++) dist += km(stops[j - 1], stops[j])
    const nightN = d.night ? (nightsAt[d.night] = (nightsAt[d.night] ?? 0) + 1) : 0
    const row: PlannedDay = { ...d, n: i + 1, date, label: dayLabel(date), from, km: dist, back: !d.night, nightN }
    from = d.night ?? HOME
    return row
  })
  const nightCount = days.filter((d) => d.night).length
  const end = addDays(start, Math.max(days.length - 1, 0))
  return {
    start,
    end,
    days: out,
    provinces: [...new Set(days.flatMap((d) => d.provinces))],
    totalKm: out.reduce((a, d) => a + d.km, 0),
    nightCount,
    longest: out.reduce<PlannedDay | null>((a, d) => (!a || d.km > a.km ? d : a), null),
    back: days.length > 0 && !days[days.length - 1].night,
    range: `${dayLabel(start)} – ${dayLabel(end)}`,
    length: lengthLabel(days.length, nightCount),
  }
}

export interface StripStop {
  code: string
  label: string
  kind: 'home' | 'visit' | 'night'
}

/** The route as a strip: Phnom Penh → visits → ☾ overnights → Phnom Penh. */
export function strip(plan: TripPlan): StripStop[] {
  const s: StripStop[] = [{ code: HOME, label: provinceName(HOME), kind: 'home' }]
  for (const d of plan.days) {
    for (const c of d.provinces) if (c !== s[s.length - 1].code) s.push({ code: c, label: provinceName(c), kind: 'visit' })
    if (d.night) {
      const last = s[s.length - 1]
      if (last.code === d.night) last.kind = 'night'
      else s.push({ code: d.night, label: provinceName(d.night), kind: 'night' })
    }
  }
  if (plan.back) s.push({ code: HOME, label: provinceName(HOME), kind: 'home' })
  return s
}

export interface TripRates {
  dayRate: number
  nightRate: number
  kmRate: number
  perRoom: number
  specialCap: number
  reasonRequired: boolean
  noticeHours: number
  leaveAt: string
  clockAnywhere: boolean
}

export const DEFAULT_RATES: TripRates = { dayRate: 10, nightRate: 15, kmRate: 0.1, perRoom: 2, specialCap: 100, reasonRequired: true, noticeHours: 24, leaveAt: '08:00', clockAnywhere: true }

export interface SpecialLine {
  reason: string
  note: string
  amount: number
}

export const SPECIAL_REASONS: { reason: string; amount: number }[] = [
  { reason: 'Ferry / boat', amount: 20 },
  { reason: 'Parking & tolls', amount: 5 },
  { reason: 'Customer event', amount: 50 },
  { reason: 'Loading help', amount: 15 },
  { reason: 'Other', amount: 10 },
]

/** Rooms a night needs: what the request says, or people ÷ people per room, rounded up. */
export function roomsFor(day: Pick<TripDayInput, 'rooms'>, people: number, perRoom: number): number {
  return day.rooms ?? Math.ceil(people / Math.max(perRoom, 1))
}

/** How people split into rooms: 3 people in 2 rooms → [2, 1]. */
export function roomSplit(people: number, rooms: number): number[] {
  const r = Math.max(rooms, 1)
  return Array.from({ length: r }, (_, k) => Math.floor(people / r) + (k < people % r ? 1 : 0))
}

export function money(n: number): string {
  const cents = Math.round(n * 100)
  return '$' + (cents % 100 ? (cents / 100).toFixed(2) : String(cents / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

export interface CostLine {
  label: string
  calc: string
  value: number
}

export interface TripCost {
  lines: CostLine[]
  total: number
  perPerson: number
  roomNights: number
  special: number
  /** Special allowance over the per-trip limit -- flagged to the approver, not blocked. */
  over: boolean
}

/** The estimate at standard rates: allowance per person-day, hotel per room-night, fuel once for the route, plus special lines. */
export function costOf(plan: TripPlan, rates: TripRates, people: number, special: SpecialLine[]): TripCost {
  const n = Math.max(people, 1)
  const roomNights = plan.days.filter((d) => d.night).reduce((a, d) => a + roomsFor(d, n, rates.perRoom), 0)
  const allowance = plan.days.length * n * rates.dayRate
  const hotel = roomNights * rates.nightRate
  const fuel = Math.round(plan.totalKm * rates.kmRate * 100) / 100
  const extra = special.reduce((a, s) => a + (Number.isFinite(s.amount) ? s.amount : 0), 0)
  const lines: CostLine[] = [
    { label: 'Daily allowance', calc: `${plural(plan.days.length, 'day')} × ${n === 1 ? '1 person' : `${n} people`} × ${money(rates.dayRate)}`, value: allowance },
    { label: 'Hotel', calc: `${plural(roomNights, 'room-night')} × ${money(rates.nightRate)}`, value: hotel },
    { label: 'Fuel / transport', calc: `≈ ${plan.totalKm} km × ${money(rates.kmRate)} · one vehicle`, value: fuel },
  ]
  if (special.length) lines.push({ label: 'Special allowance', calc: plural(special.length, 'item'), value: extra })
  const total = allowance + hotel + fuel + extra
  return { lines, total, perPerson: total / n, roomNights, special: extra, over: extra > rates.specialCap }
}

/** Phnom Penh is UTC+7 all year. */
const PP_OFFSET_MS = 7 * 3_600_000

/** Hours from `now` until the trip leaves (leaveAt on its first day, Phnom Penh time). */
export function hoursBefore(start: string, leaveAt: string, now: Date = new Date()): number {
  const leaves = Date.parse(`${start}T${leaveAt.slice(0, 5)}:00Z`) - PP_OFFSET_MS
  return Math.floor((leaves - now.getTime()) / 3_600_000)
}

/** Today's date in Phnom Penh. */
export function ppToday(now: Date = new Date()): string {
  return new Date(now.getTime() + PP_OFFSET_MS).toISOString().slice(0, 10)
}

/** The first start date that still gives `noticeHours` of notice. */
export function earliestStart(noticeHours: number, leaveAt: string, now: Date = new Date()): string {
  let d = ppToday(now)
  while (hoursBefore(d, leaveAt, now) < noticeHours) d = addDays(d, 1)
  return d
}

export interface BusyDay {
  day: string
  why: string
}

/** "On another trip Tue 6 Oct, Wed 7 Oct · Leave Thu 8 Oct" for the days inside the trip, '' when free. */
export function busyText(busy: BusyDay[], start: string, end: string): string {
  const by = new Map<string, string[]>()
  for (const b of busy) {
    if (b.day < start || b.day > end) continue
    by.set(b.why, [...(by.get(b.why) ?? []), dayLabel(b.day)])
  }
  return [...by.entries()].map(([why, days]) => `${why} ${days.join(', ')}`).join(' · ')
}

/** Initials for an avatar chip. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : parts[0]?.[1] ?? '')).toUpperCase()
}

export const AVATAR_TONES = ['bg-brand-500', 'bg-status-working', 'bg-status-visiting', 'bg-earth-500', 'bg-status-danger', 'bg-brand-700']
