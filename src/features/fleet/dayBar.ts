/** What a stretch of someone's day was, in the bar's colours. */
export type SegKind = 'visit' | 'gap' | 'flag' | 'out' | 'todo' | 'miss'

/** Legend order and labels, as on the canvas. */
export const DAY_BAR_LEGEND: [SegKind, string][] = [
  ['visit', 'Visit'],
  ['gap', 'Travel / gaps'],
  ['flag', 'Flagged'],
  ['out', 'Outside hours'],
  ['miss', 'Missed'],
]

export interface Seg {
  kind: SegKind
  from: number
  to: number
}

export interface DayInput {
  /** Epoch ms of the first clock-in today, or null if they haven't clocked in. */
  clockIn: number | null
  /** Epoch ms of the clock-out, or null while still on the clock. */
  clockOut: number | null
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
 * the rest of the shift still to come; and, with no clock-in after the
 * shift started, the missed time.
 */
export function daySegments(d: DayInput): Seg[] {
  const out: Seg[] = []
  if (d.clockIn == null) {
    if (d.now > d.shiftStart) out.push({ kind: 'miss', from: d.shiftStart, to: Math.min(d.now, d.shiftEnd) })
    if (d.now < d.shiftEnd) out.push({ kind: 'todo', from: Math.max(d.now, d.shiftStart), to: d.shiftEnd })
    return out
  }
  const endWork = d.clockOut ?? d.now
  const visits = d.visits
    .map(([a, b]) => [Math.max(a, d.clockIn!), Math.min(b ?? d.now, endWork)] as const)
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0])

  // A gap: travel first; past the idle limit the rest is flagged. Time outside working hours is its own colour.
  const gap = (a: number, b: number) => {
    if (b <= a) return
    const flagFrom = a + d.flagAfterMin * 60_000
    const cuts = [a, ...[flagFrom, d.shiftStart, d.shiftEnd].filter((t) => t > a && t < b), b].sort((x, y) => x - y)
    for (let i = 0; i < cuts.length - 1; i++) {
      const [x, y] = [cuts[i], cuts[i + 1]]
      const kind: SegKind = y <= d.shiftStart || x >= d.shiftEnd ? 'out' : x >= flagFrom ? 'flag' : 'gap'
      const last = out[out.length - 1]
      if (last && last.kind === kind && last.to === x) last.to = y
      else out.push({ kind, from: x, to: y })
    }
  }

  let at = d.clockIn
  for (const [a, b] of visits) {
    if (b <= at) continue
    gap(at, Math.max(a, at))
    out.push({ kind: 'visit', from: Math.max(a, at), to: b })
    at = b
  }
  gap(at, endWork)
  if (d.clockOut == null && d.now < d.shiftEnd) out.push({ kind: 'todo', from: Math.max(d.now, d.clockIn), to: d.shiftEnd })
  return out
}
