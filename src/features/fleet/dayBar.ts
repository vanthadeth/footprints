/** What a stretch of someone's day was, in the bar's colours. */
export type SegKind = 'visit' | 'gap' | 'flag' | 'out' | 'off' | 'todo' | 'miss'

/** Legend order and labels, as on the canvas. */
export const DAY_BAR_LEGEND: [SegKind, string][] = [
  ['visit', 'Visit'],
  ['gap', 'Travel / gaps'],
  ['flag', 'Flagged'],
  ['out', 'Outside hours'],
  ['off', 'Clocked out'],
  ['miss', 'Missed'],
]

export interface Seg {
  kind: SegKind
  from: number
  to: number
  /** Which visit a 'visit' stretch is (its index in the input list). */
  visit?: number
}

export interface DayInput {
  /** Epoch ms of the first clock-in today, or null if they haven't clocked in. */
  clockIn: number | null
  /** Epoch ms of the clock-out, or null while still on the clock. */
  clockOut: number | null
  /**
   * Each clock-in / clock-out session as [in, out or null while open]. A day
   * can have several (a lunch break, a split shift); the time between them is
   * off the clock. Omitted: one session from clockIn to clockOut.
   */
  sessions?: [number, number | null][]
  /** Today's visits as [check-in, check-out or null while open], any order. */
  visits: [number, number | null][]
  shiftStart: number
  shiftEnd: number
  now: number
  /** A gap between visits at least this long is flagged. */
  flagAfterMin: number
}

/**
 * The day as coloured stretches (canvas Polish › Team, "same bar language
 * as Today › Your day"): visits; travel and gaps between them, the part
 * past the idle limit flagged; time on the clock outside working hours;
 * time off the clock between two sessions; the rest of the shift still to
 * come; and, with no clock-in after the shift started, the missed time.
 * The idle limit starts again at each clock-in.
 */
export function daySegments(d: DayInput): Seg[] {
  const out: Seg[] = []
  if (d.clockIn == null) {
    if (d.now > d.shiftStart) out.push({ kind: 'miss', from: d.shiftStart, to: Math.min(d.now, d.shiftEnd) })
    if (d.now < d.shiftEnd) out.push({ kind: 'todo', from: Math.max(d.now, d.shiftStart), to: d.shiftEnd })
    return out
  }
  const endWork = d.clockOut ?? d.now
  const sessions = (d.sessions?.length ? d.sessions : [[d.clockIn, d.clockOut] as [number, number | null]])
    .map(([a, b]) => [a, Math.min(b ?? d.now, endWork)] as const)
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0])
  const visits = d.visits
    .map(([a, b], i) => [Math.max(a, d.clockIn!), Math.min(b ?? d.now, endWork), i] as const)
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0])
  const push = (kind: SegKind, x: number, y: number, visit?: number) => {
    const last = out[out.length - 1]
    if (visit === undefined && last && last.kind === kind && last.to === x) last.to = y
    else out.push(visit === undefined ? { kind, from: x, to: y } : { kind, from: x, to: y, visit })
  }

  // A gap: travel first; past the idle limit the rest is flagged. Time outside working hours is its own colour.
  const gap = (a: number, b: number) => {
    if (b <= a) return
    const flagFrom = a + d.flagAfterMin * 60_000
    const cuts = [a, ...[flagFrom, d.shiftStart, d.shiftEnd].filter((t) => t > a && t < b), b].sort((x, y) => x - y)
    for (let i = 0; i < cuts.length - 1; i++) {
      const [x, y] = [cuts[i], cuts[i + 1]]
      push(y <= d.shiftStart || x >= d.shiftEnd ? 'out' : x >= flagFrom ? 'flag' : 'gap', x, y)
    }
  }

  let prevEnd: number | null = null
  for (const [s, e] of sessions) {
    if (prevEnd != null && s > prevEnd) push('off', prevEnd, s)
    let at = prevEnd != null ? Math.max(s, prevEnd) : s
    for (const [a0, b0, i] of visits) {
      const [a, b] = [Math.max(a0, s), Math.min(b0, e)]
      if (b <= at || b <= a) continue
      gap(at, Math.max(a, at))
      push('visit', Math.max(a, at), b, i)
      at = b
    }
    gap(at, e)
    prevEnd = Math.max(prevEnd ?? e, e)
  }
  if (d.clockOut == null && d.now < d.shiftEnd) out.push({ kind: 'todo', from: Math.max(d.now, d.clockIn), to: d.shiftEnd })
  return out
}

/** Minutes of each kind, and each kind's whole-number share of the time on the clock (out, gap, flag, visit) adding up to 100. */
export function dayBreakdown(segs: Seg[]): { kind: SegKind; minutes: number; pct: number }[] {
  const order: SegKind[] = ['out', 'gap', 'flag', 'visit']
  const mins = order.map((k) => Math.round(segs.filter((g) => g.kind === k).reduce((n, g) => n + g.to - g.from, 0) / 60_000))
  const total = mins.reduce((a, b) => a + b, 0)
  if (!total) return order.map((kind) => ({ kind, minutes: 0, pct: 0 }))
  const exact = mins.map((m) => (m / total) * 100)
  const pct = exact.map(Math.floor)
  exact
    .map((v, i) => [v - pct[i], i] as const)
    .sort((a, b) => b[0] - a[0])
    .slice(0, 100 - pct.reduce((a, b) => a + b, 0))
    .forEach(([, i]) => (pct[i] += 1))
  return order.map((kind, i) => ({ kind, minutes: mins[i], pct: pct[i] }))
}

/** What each kind of stretch is called when someone points at it. */
export const SEG_LABEL: Record<SegKind, string> = {
  visit: 'Visit',
  gap: 'Travel, rest & gaps',
  flag: 'Flagged travel or rest',
  out: 'Outside working hours',
  off: 'Clocked out (between sessions)',
  todo: 'Still to go',
  miss: 'Missed — not clocked in',
}

const hhmm = (ms: number) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Phnom_Penh', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ms))
export const minutesText = (ms: number) => {
  const m = Math.max(0, Math.round(ms / 60_000))
  return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `${m} min`
}

/** "Visit · Golden Rice Trading · 08:37–09:12 · 35 min". */
export function segText(g: Seg, visitName?: string | null): string {
  const what = g.kind === 'visit' && visitName ? `${SEG_LABEL.visit} · ${visitName}` : SEG_LABEL[g.kind]
  return `${what} · ${hhmm(g.from)}–${hhmm(g.to)} · ${minutesText(g.to - g.from)}`
}

/** "YYYY-MM-DD" + "HH:MM[:SS]" in Phnom Penh time → epoch ms. */
export const atLocal = (day: string, hm: string) => new Date(`${day}T${hm.slice(0, 5)}:00+07:00`).getTime()

/**
 * Segments straight from a day's attendance and visit rows: first clock-in
 * to the last clock-out (still open if any session is), cancelled visits
 * left out. `live` is the visits kept, in the order `Seg.visit` refers to.
 */
export function segmentsFor<V extends { checked_in_at: string; checked_out_at: string | null; cancelled_at: string | null }>(opts: {
  attendance: { clock_in_at: string; clock_out_at: string | null }[]
  visits: V[]
  shiftStart: number
  shiftEnd: number
  now: number
  flagAfterMin: number
}): { segs: Seg[]; live: V[]; clockIn: number | null; clockOut: number | null } {
  const live = opts.visits.filter((v) => !v.cancelled_at)
  const ins = opts.attendance.map((a) => Date.parse(a.clock_in_at))
  const clockIn = ins.length ? Math.min(...ins) : null
  const open = opts.attendance.some((a) => !a.clock_out_at)
  const clockOut = !opts.attendance.length || open ? null : Math.max(...opts.attendance.map((a) => Date.parse(a.clock_out_at!)))
  const segs = daySegments({
    clockIn,
    clockOut,
    visits: live.map((v) => [Date.parse(v.checked_in_at), v.checked_out_at ? Date.parse(v.checked_out_at) : null]),
    sessions: opts.attendance.map((a) => [Date.parse(a.clock_in_at), a.clock_out_at ? Date.parse(a.clock_out_at) : null]),
    shiftStart: opts.shiftStart,
    shiftEnd: opts.shiftEnd,
    now: opts.now,
    flagAfterMin: opts.flagAfterMin,
  })
  return { segs, live, clockIn, clockOut }
}
