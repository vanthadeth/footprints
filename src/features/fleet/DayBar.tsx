import type { Seg, SegKind } from './dayBar'

const FILL: Record<SegKind, string> = {
  visit: 'bg-brand-500',
  gap: 'bg-neutral-300 dark:bg-neutral-600',
  flag: 'bg-[#f8cf86] dark:bg-[#e6b45e]',
  out: 'bg-status-working',
  todo: 'bg-neutral-100',
  miss: 'bg-status-danger/15',
}

/** One person's day as separated, slightly rounded stretches on a shared time range (canvas Polish › Team). */
export function DayBar({ segs, from, to, label }: { segs: Seg[]; from: number; to: number; label: string }) {
  const pct = (ms: number) => ((Math.min(to, Math.max(from, ms)) - from) / (to - from)) * 100
  return (
    <span role="img" aria-label={label} className="relative mt-2.5 block h-2">
      {segs.map((g) => {
        const x = pct(g.from)
        const w = pct(g.to) - x
        if (w <= 0) return null
        return <span key={`${g.kind}${g.from}`} className={`absolute inset-y-0 rounded-[2px] ${FILL[g.kind]}`} style={{ left: `calc(${x.toFixed(2)}% + 1px)`, width: `max(2px, calc(${w.toFixed(2)}% - 2px))` }} />
      })}
    </span>
  )
}

/** The swatch for a legend entry. */
export function DayBarSwatch({ kind }: { kind: SegKind }) {
  return <span className={`h-2.5 w-2.5 rounded-[3px] ${FILL[kind]}`} />
}
