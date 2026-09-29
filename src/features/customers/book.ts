import { APP_TIMEZONE } from '@/lib/config'
import { displayName } from '@/lib/displayName'
import type { BookRow, Bucket, SummaryRow, Visitor } from './customerBookService'
import { provinceEnglish } from './provinces'

/**
 * Shared logic for the Customers list, Customer detail and Customer
 * briefing: last-visit ranges, the filter model, row text and paging.
 * Pure functions only, so the design's rules are unit-tested in one place.
 */

export const PAGE_SIZE = 20

// ---------------------------------------------------------------- ranges

export const RANGES: { key: Bucket; label: string; dot: string }[] = [
  { key: '0-14', label: '0–14 days', dot: 'bg-status-working' },
  { key: '15-30', label: '15–30 days', dot: 'bg-status-warn' },
  { key: '31-60', label: '31–60 days', dot: 'bg-status-danger' },
  { key: '60+', label: '60+ days', dot: 'bg-status-danger' },
  { key: 'never', label: 'Never visited', dot: 'bg-neutral-400' },
]

/** The Due tab: anything not seen in the last two weeks, or never. */
export const DUE_RANGES: Bucket[] = ['15-30', '31-60', '60+', 'never']

/** Overdue (31–60), lapsed (60+) or never visited: the red "to visit" count. */
export function isLate(bucket: Bucket): boolean {
  return bucket === '31-60' || bucket === '60+' || bucket === 'never'
}

export type Urgency = 'fresh' | 'ok' | 'due' | 'overdue' | 'lapsed' | 'never'

export function urgency(days: number | null): Urgency {
  if (days == null) return 'never'
  if (days <= 7) return 'fresh'
  if (days <= 14) return 'ok'
  if (days <= 30) return 'due'
  if (days <= 60) return 'overdue'
  return 'lapsed'
}

export const URGENCY: Record<Urgency, { label: string; chip: string }> = {
  fresh: { label: 'Visited', chip: 'bg-status-working/10 text-status-working dark:bg-emerald-400/15 dark:text-emerald-300' },
  ok: { label: 'Visited', chip: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300' },
  due: { label: 'Due', chip: 'bg-status-warn/10 text-status-warn dark:bg-amber-400/15 dark:text-amber-300' },
  overdue: { label: 'Overdue', chip: 'bg-status-danger/10 text-status-danger dark:bg-red-400/15 dark:text-red-300' },
  lapsed: { label: 'Lapsed', chip: 'bg-status-danger text-white' },
  never: { label: 'Never visited', chip: 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400' },
}

// ---------------------------------------------------------------- filter

export const MONTHS = [1, 3, 6, 12] as const

export interface CustomerFilter {
  ranges: Bucket[]
  months: number
  /** User ids; empty = anyone. */
  people: string[]
  mode: 'visited' | 'not'
}

export const EMPTY_FILTER: CustomerFilter = { ranges: [], months: 3, people: [], mode: 'visited' }

/** The people section only filters once someone is picked, or "Not visited" is on. */
export function peopleActive(f: CustomerFilter): boolean {
  return f.people.length > 0 || f.mode === 'not'
}

export function activeCount(f: CustomerFilter): number {
  return f.ranges.length + (peopleActive(f) ? 1 : 0)
}

export function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value]
}

function monthsText(m: number): string {
  return `${m} ${m === 1 ? 'month' : 'months'}`
}

/** "Visited by Dara & Sokha · 3 months", "Not visited by anyone · 1 month". */
export function peopleLabel(f: CustomerFilter, names: Record<string, string>): string {
  const first = f.people.map((id) => (names[id] ?? 'Someone').split(' ')[0])
  const who = first.length === 0 ? 'anyone' : first.length <= 2 ? first.join(' & ') : `${first[0]} +${first.length - 1}`
  return `${f.mode === 'not' ? 'Not visited by' : 'Visited by'} ${who} · ${monthsText(f.months)}`
}

export function peopleHint(f: CustomerFilter, names: Record<string, string>): string {
  if (!peopleActive(f)) return 'Pick people, or switch to "Not visited" to find customers nobody has seen.'
  return `${peopleLabel(f, names).replace(/ · .*/, '')} in the last ${monthsText(f.months)}.`
}

export interface FilterChip {
  key: string
  label: string
}

export function filterChips(f: CustomerFilter, names: Record<string, string>): FilterChip[] {
  const chips: FilterChip[] = f.ranges.map((k) => ({ key: `r:${k}`, label: RANGES.find((r) => r.key === k)?.label ?? k }))
  if (peopleActive(f)) chips.push({ key: 'people', label: peopleLabel(f, names) })
  return chips
}

export function removeChip(f: CustomerFilter, key: string): CustomerFilter {
  if (key === 'people') return { ...f, people: [], mode: 'visited' }
  return { ...f, ranges: f.ranges.filter((r) => `r:${r}` !== key) }
}

/** user id -> display name, for chips and the people picker. */
export function visitorNames(visitors: Visitor[]): Record<string, string> {
  return Object.fromEntries(visitors.map((v) => [v.user_id, displayName(v.full_name, v.nickname)]))
}

// ---------------------------------------------------------------- summary

export interface ProvinceGroup {
  code: string
  km: string
  en: string
  /** Customers passing search / owner / people (before the range filter). */
  total: number
  /** ...and the range filter too. */
  matching: number
  /** Overdue, lapsed or never visited among `matching`. */
  late: number
}

export interface BookSummary {
  provinces: ProvinceGroup[]
  /** Per range, among customers that pass search / owner / people -- what each option would give. */
  rangeCounts: Record<Bucket, number>
  total: number
  matching: number
  late: number
}

/** Folds customer_book_summary rows into province groups, biggest first ("no province" last). */
export function summarize(rows: SummaryRow[], ranges: Bucket[]): BookSummary {
  const rangeCounts = Object.fromEntries(RANGES.map((r) => [r.key, 0])) as Record<Bucket, number>
  const byCode = new Map<string, ProvinceGroup>()
  for (const r of rows) {
    rangeCounts[r.bucket] += r.n
    let g = byCode.get(r.province_code)
    if (!g) {
      const en = provinceEnglish(r.province_code)
      g = { code: r.province_code, km: r.province_name, en: en === r.province_name ? '' : en, total: 0, matching: 0, late: 0 }
      byCode.set(r.province_code, g)
    }
    g.total += r.n
    if (ranges.length === 0 || ranges.includes(r.bucket)) {
      g.matching += r.n
      if (isLate(r.bucket)) g.late += r.n
    }
  }
  const provinces = [...byCode.values()].sort((a, b) => Number(a.code === 'none') - Number(b.code === 'none') || b.total - a.total || a.km.localeCompare(b.km))
  return {
    provinces,
    rangeCounts,
    total: provinces.reduce((a, p) => a + p.total, 0),
    matching: provinces.reduce((a, p) => a + p.matching, 0),
    late: provinces.reduce((a, p) => a + p.late, 0),
  }
}

// ---------------------------------------------------------------- row text

export function firstName(fullName: string | null, nickname?: string | null): string {
  if (!fullName && !nickname) return ''
  return displayName(fullName ?? '', nickname).split(' ')[0]
}

function daysText(days: number): string {
  return days === 0 ? 'Today' : `${days} ${days === 1 ? 'day' : 'days'}`
}

/** "12 days · Dara", "Today · Sokha", "Never visited". */
export function lastVisitText(r: Pick<BookRow, 'days_since' | 'last_by_name' | 'last_by_nickname'>): string {
  if (r.days_since == null) return 'Never visited'
  const who = firstName(r.last_by_name, r.last_by_nickname)
  return who ? `${daysText(r.days_since)} · ${who}` : daysText(r.days_since)
}

/** The list's chip: urgency word first when it matters ("Overdue · 45 days · Dara"). */
export function lastVisitChip(r: Pick<BookRow, 'days_since' | 'last_by_name' | 'last_by_nickname'>): string {
  const u = urgency(r.days_since)
  if (u === 'never') return 'Never visited'
  const text = lastVisitText(r)
  return u === 'due' || u === 'overdue' || u === 'lapsed' ? `${URGENCY[u].label} · ${text}` : text
}

export function freqText(r: Pick<BookRow, 'freq_days' | 'visits_90'>): string {
  if (r.freq_days) return `every ~${r.freq_days} days`
  return r.visits_90 === 1 ? 'once in 90 days' : '—'
}

export function formatUsd0(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`
}

/** "Ordered · $120", "Nobody there", "No order", "—". */
export function outcomeText(r: Pick<BookRow, 'last_visit_at' | 'last_visit_status' | 'last_order_status' | 'last_amount'>): string {
  if (!r.last_visit_at) return '—'
  if (r.last_order_status === 'Ordered') return r.last_amount ? `Ordered · ${formatUsd0(r.last_amount)}` : 'Ordered'
  if (r.last_visit_status === 'Nobody there' || r.last_visit_status === 'Shop closed') return r.last_visit_status
  return r.last_order_status ?? r.last_visit_status ?? 'Visited'
}

export function visitsText(n: number): string {
  return `${n} ${n === 1 ? 'visit' : 'visits'}`
}

// ---------------------------------------------------------------- dates

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "YYYY-MM-DD" of an instant in the app timezone. */
export function localDay(iso: string, timeZone: string = APP_TIMEZONE): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
}

/** "Fri 18 Sep" for a "YYYY-MM-DD" day or an ISO instant (read in the app timezone). */
export function shortDay(dayOrIso: string): string {
  const day = dayOrIso.length > 10 ? localDay(dayOrIso) : dayOrIso
  const [y, m, d] = day.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  return `${WD[date.getUTCDay()]} ${d} ${MO[m - 1]}`
}

/** Whole days from `from` to `to`, both "YYYY-MM-DD". */
export function dayDiff(from: string, to: string): number {
  const [y1, m1, d1] = from.split('-').map(Number)
  const [y2, m2, d2] = to.split('-').map(Number)
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000)
}

export function agoText(days: number): string {
  return days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`
}

// ---------------------------------------------------------------- paging

export interface Pager {
  pages: number
  page: number
  from: number
  to: number
  label: string
}

export function pager(count: number, page: number, size = PAGE_SIZE): Pager {
  const pages = Math.max(1, Math.ceil(count / size))
  const p = Math.min(Math.max(1, page), pages)
  const from = count ? (p - 1) * size + 1 : 0
  const to = Math.min(count, p * size)
  return { pages, page: p, from, to, label: count ? `${from}–${to} of ${count.toLocaleString('en-US')}` : 'No customers' }
}

/** Page buttons: 1 … p-1 p p+1 … last. */
export function pageButtons(pages: number, page: number): (number | '…')[] {
  const nums = [...new Set([1, pages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= pages))].sort((a, b) => a - b)
  const out: (number | '…')[] = []
  nums.forEach((n, i) => {
    if (i && n - nums[i - 1] > 1) out.push('…')
    out.push(n)
  })
  return out
}
