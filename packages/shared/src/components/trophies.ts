export type TrophyId = 'sales' | 'visits' | 'newcustomer' | 'attendance' | 'system'
export type Tier = 'gold' | 'silver'
export type Lang = 'en' | 'km'

export interface TrophyDef {
  id: TrophyId
  name: string
  /** The label under a medal tile. */
  short: Record<Lang, string>
  /** `target`: progress is actual against a monthly target. `rate`: the number itself is the percentage. */
  kind: 'target' | 'rate'
  /** What is counted, for "74 more visits to reach 100%". */
  noun: string
  money?: boolean
  /** Percentage needed for each tier (of target for `target`, absolute for `rate`). */
  gold: number
  silver?: number
  /** The rule behind each tier, as written on the rules table. */
  rule: { gold: string; silver?: string }
  /** The "How it is counted" text. */
  how: string
  /** What the gold tier is called in "Next unlock: ..." when it is not "Gold". */
  goldName?: string
}

/** The five monthly trophies. Gold and silver each, except New customer and System master which have gold only. */
export const TROPHIES: TrophyDef[] = [
  {
    id: 'sales', name: 'Sales target', short: { en: 'Sales', km: 'លក់' }, kind: 'target', noun: 'sales', money: true, gold: 100, silver: 80,
    rule: { gold: '100% of target', silver: '80% of target' },
    how: 'Sales this month divided by your monthly target (daily order target x working days).',
  },
  {
    id: 'visits', name: 'Visit target', short: { en: 'Visits', km: 'ជួប' }, kind: 'target', noun: 'visits', gold: 100, silver: 80,
    rule: { gold: '100% of target', silver: '80% of target' },
    how: 'Visits that count (5 minutes or longer) divided by your monthly visit target.',
  },
  {
    id: 'newcustomer', name: 'New customer target', short: { en: 'New', km: 'បើកថ្មី' }, kind: 'target', noun: 'new customers', gold: 100,
    rule: { gold: '100% of target' },
    how: 'New customers you added and visited this month divided by your monthly target.',
  },
  {
    id: 'attendance', name: 'Attendance', short: { en: 'Attendance', km: 'វត្តមាន' }, kind: 'rate', noun: 'attendance', gold: 100, silver: 95,
    rule: { gold: '100%: no late, no absent', silver: '95%: up to 2 late, each under 30 minutes' },
    how: 'Counted from clock-ins against your schedule. Approved leave is not counted as absent.',
  },
  {
    id: 'system', name: 'System master', short: { en: 'CRM', km: 'ប្រព័ន្ធ' }, kind: 'rate', noun: 'accuracy', gold: 90,
    goldName: 'Master',
    rule: { gold: '90% accuracy of using the system' },
    how: 'Share of your records entered correctly and on time: visits checked out, orders marked, check-ins in range.',
  },
]

export const trophyDef = (id: TrophyId): TrophyDef => TROPHIES.find((t) => t.id === id)!

export interface TrophyProgress {
  /** What the person has done so far: sales, visits, new customers, or the attendance or accuracy percentage. */
  actual: number
  /** The monthly target (`target` kind only). */
  target?: number
  /** Attendance: the minutes of each late clock-in, and the number of absences. */
  lates?: number[]
  absences?: number
}

export type MonthProgress = Record<TrophyId, TrophyProgress>
export interface Medal { id: TrophyId; tier: Tier }

/** Progress as an exact percentage: actual over target, or the rate itself. Tiers are decided on this, never on the rounded figure. */
export function exactPercent(def: TrophyDef, p: TrophyProgress): number {
  if (def.kind === 'rate') return p.actual
  return p.target && p.target > 0 ? (p.actual / p.target) * 100 : 0
}

/** Progress as a whole percentage, for showing. */
export const percentOf = (def: TrophyDef, p: TrophyProgress): number => Math.round(exactPercent(def, p))

/** The best tier reached, or null. Attendance also needs no absence, and for silver at most 2 lates under 30 minutes each. */
export function earnedTier(def: TrophyDef, p: TrophyProgress): Tier | null {
  const pct = exactPercent(def, p)
  if (def.id === 'attendance') {
    const lates = p.lates ?? []
    if (pct >= def.gold && lates.length === 0 && !(p.absences ?? 0)) return 'gold'
    if (def.silver !== undefined && pct >= def.silver && lates.length <= 2 && lates.every((m) => m < 30)) return 'silver'
    return null
  }
  if (pct >= def.gold) return 'gold'
  if (def.silver !== undefined && pct >= def.silver) return 'silver'
  return null
}

/** Earned, working on it, or nothing yet. */
export function tileState(def: TrophyDef, p: TrophyProgress): 'earned' | 'progress' | 'notStarted' {
  if (earnedTier(def, p)) return 'earned'
  return exactPercent(def, p) > 0 ? 'progress' : 'notStarted'
}

/** The tier to go for next: silver first when the trophy has one, then gold; null at the top. */
export function nextTier(def: TrophyDef, earned: Tier | null): Tier | null {
  if (earned === 'gold') return null
  if (earned === 'silver') return 'gold'
  return def.silver !== undefined ? 'silver' : 'gold'
}

const threshold = (def: TrophyDef, tier: Tier) => (tier === 'gold' ? def.gold : def.silver!)

/** How far along one tier's bar is, 0-100 with one decimal: 58% of target is 72.5 towards an 80% silver. */
export function tierBar(def: TrophyDef, p: TrophyProgress, tier: Tier): number {
  const v = (exactPercent(def, p) / threshold(def, tier)) * 100
  return Math.min(100, Math.round(v * 10) / 10)
}

/** What is still missing for a tier: units (sales, visits, customers) for a target kind, percentage points for a rate. 0 once reached. */
export function remaining(def: TrophyDef, p: TrophyProgress, tier: Tier): number {
  const t = threshold(def, tier)
  if (def.kind === 'rate') return Math.max(0, Math.ceil(t - exactPercent(def, p)))
  return Math.max(0, Math.ceil(((p.target ?? 0) * t) / 100 - p.actual))
}

const money = (n: number) => `$${n.toLocaleString('en-US')}`

/** "$960 more sales to reach 100%", "74 more visits to reach 100%", "19 points more accuracy to reach 90%". */
export function needText(def: TrophyDef, p: TrophyProgress, tier: Tier): string {
  const t = threshold(def, tier)
  if (def.id === 'attendance' && tier === 'gold') return 'Gold needs a month with no late and no absent'
  const n = remaining(def, p, tier)
  if (def.kind === 'rate') return `${n} points more ${def.noun} to reach ${t}%`
  return `${def.money ? money(n) : n} more ${def.noun} to reach ${t}%`
}

/** The line under a trophy's name: "84% of target · $5,040 of $6,000", "95% · 1 late (12 min), no absent". */
export function statusText(def: TrophyDef, p: TrophyProgress): string {
  const pct = percentOf(def, p)
  if (def.id === 'attendance') {
    const lates = p.lates ?? []
    const late = lates.length ? `${lates.length} late (${lates.reduce((a, b) => a + b, 0)} min)` : 'no late'
    const absent = p.absences ? `${p.absences} absent` : 'no absent'
    return `${pct}% · ${late}, ${absent}`
  }
  if (def.id === 'system') return `${pct}% accuracy using the system`
  const count = def.money ? `${money(p.actual)} of ${money(p.target ?? 0)}` : `${p.actual} of ${p.target ?? 0} ${def.noun}`
  return `${pct}% of target · ${count}`
}

export const tierLabel = (tier: Tier | null) => (tier === 'gold' ? 'Gold' : tier === 'silver' ? 'Silver' : 'Not yet')

/** The small line under a medal tile: nothing left to do shows the percentage; otherwise how much is missing (Khmer: ត្រូវការ ... ទៀត). */
export function tileSub(def: TrophyDef, p: TrophyProgress, lang: Lang = 'en'): string {
  const earned = earnedTier(def, p)
  const next = nextTier(def, earned)
  const pct = `${percentOf(def, p)}%`
  if (!next || def.id === 'attendance') return pct
  const n = remaining(def, p, next)
  const amount = def.kind === 'rate' ? `${n} pts` : def.money ? money(n) : String(n)
  return lang === 'km' ? `ត្រូវការ ${amount === `${n} pts` ? `${n} ពិន្ទុ` : amount} ទៀត` : `${amount} more`
}

export interface MonthSummary { medals: Medal[]; count: number; total: number; toUnlock: number }

/** The medals earned this month, how many of the five, and how many are left to unlock. */
export function monthSummary(progress: MonthProgress): MonthSummary {
  const medals: Medal[] = []
  for (const def of TROPHIES) {
    const tier = earnedTier(def, progress[def.id])
    if (tier) medals.push({ id: def.id, tier })
  }
  return { medals, count: medals.length, total: TROPHIES.length, toUnlock: TROPHIES.length - medals.length }
}

export interface HistoryMonth {
  /** "October 2026". */
  label: string
  inProgress?: boolean
  medals: Medal[]
}

/** "No trophies", "1 trophy", "3 trophies"; an unfinished month reads "In progress · 3 trophies". */
export function historySub(m: HistoryMonth): string {
  const n = m.medals.length
  const count = n === 0 ? 'No trophies' : n === 1 ? '1 trophy' : `${n} trophies`
  return m.inProgress ? `In progress · ${count}` : count
}

/** Trophies and gold ones over the listed months. */
export function historyTotals(months: HistoryMonth[]): { trophies: number; gold: number } {
  let trophies = 0
  let gold = 0
  for (const m of months) {
    trophies += m.medals.length
    gold += m.medals.filter((x) => x.tier === 'gold').length
  }
  return { trophies, gold }
}

/** A tier's name in "Next unlock: Gold": System master calls its gold "Master". */
export const tierName = (def: TrophyDef, tier: Tier) => (tier === 'gold' ? def.goldName ?? 'Gold' : 'Silver')

/** The bold line of the details sheet: "39 more visits to reach Silver.", or the top-tier message. */
export function nextLine(def: TrophyDef, p: TrophyProgress): string {
  const next = nextTier(def, earnedTier(def, p))
  if (!next) return 'Top tier reached. Keep it up.'
  if (def.id === 'attendance' && next === 'gold') return 'Gold needs a month with no late and no absent.'
  const n = remaining(def, p, next)
  const name = tierName(def, next)
  if (def.kind === 'rate') return `${n} points more ${def.noun} to reach ${name}.`
  return `${def.money ? money(n) : n} more ${def.noun} to reach ${name}.`
}

/** What is still missing for a tier, short: "$960 more", "74 more", "5 pts to go". */
export function tierToGo(def: TrophyDef, p: TrophyProgress, tier: Tier): string {
  const n = remaining(def, p, tier)
  if (def.kind === 'rate') return `${n} pts to go`
  return `${def.money ? money(n) : n} more`
}
