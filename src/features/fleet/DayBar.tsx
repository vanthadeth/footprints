import { useState, type ReactNode } from 'react'
import type { Seg, SegKind } from './dayBar'

type Tone = 'card' | 'hero'
type Size = 'sm' | 'md' | 'lg'

/** The canvas's bar colours: on a white card, and on the dark Check In card. */
const FILL: Record<Tone, Record<SegKind, string>> = {
  card: {
    visit: 'bg-brand-500',
    gap: 'bg-neutral-300 dark:bg-neutral-600',
    flag: 'bg-[#f8cf86] dark:bg-[#e6b45e]',
    out: 'bg-status-working',
    off: 'seg-off text-neutral-300 dark:text-[#5a5a5a]',
    todo: 'bg-neutral-100',
    miss: 'bg-status-danger/15',
  },
  hero: {
    visit: 'bg-[#5aa2ea]',
    gap: 'bg-white/30',
    flag: 'bg-[#f8cf86]',
    out: 'bg-[#17CB49]',
    off: 'seg-off text-white/30',
    todo: 'bg-white/[.12]',
    miss: 'bg-[#F96767]/30',
  },
}

/** Height, corner and the space between stretches: rows on Team (sm), cards (md), the big "Your day" bars (lg). */
const SIZE: Record<Size, { h: string; r: string; gap: number }> = {
  sm: { h: 'h-2', r: 'rounded-[2px]', gap: 2 },
  md: { h: 'h-3', r: 'rounded-[3px]', gap: 2 },
  lg: { h: 'h-5', r: 'rounded-[4px]', gap: 3 },
}

export interface DayMark {
  at: number
  label: string
  accent?: boolean
}

export interface DayPin {
  at: number
  dots: { key: string; label: string; icon: ReactNode; tone: string }[]
}

/**
 * One person's day as separated, rounded stretches (canvas Polish ›
 * Team / Journey / Clock out). `describe` turns the bar into buttons: hover
 * or tap a stretch to light it and dim the rest, with what it was as its
 * label. `marks` sit above (In / Now), `pins` below (a visit's outcomes).
 */
export function DayBar({
  segs,
  from,
  to,
  label,
  size = 'sm',
  tone = 'card',
  describe,
  marks,
  pins,
  className = '',
}: {
  segs: Seg[]
  from: number
  to: number
  label: string
  size?: Size
  tone?: Tone
  describe?: (seg: Seg) => string
  marks?: DayMark[]
  pins?: DayPin[]
  className?: string
}) {
  const [lit, setLit] = useState<number | null>(null)
  const span = Math.max(1, to - from)
  const pct = (ms: number) => ((Math.min(to, Math.max(from, ms)) - from) / span) * 100
  const { h, r, gap } = SIZE[size]
  const edge = (p: number) => (p < 10 ? '0%' : p > 90 ? '-100%' : '-50%')

  const bar = (
    <span role={describe ? 'group' : 'img'} aria-label={label} className={`relative block ${h}`} onMouseLeave={() => setLit(null)}>
      {segs.map((g, i) => {
        const x = pct(g.from)
        const w = pct(g.to) - x
        if (w <= 0) return null
        const style = { left: `calc(${x.toFixed(2)}% + ${gap / 2}px)`, width: `max(2px, calc(${w.toFixed(2)}% - ${gap}px))`, opacity: lit === null || lit === i ? 1 : 0.3 }
        const cls = `absolute inset-y-0 ${r} ${FILL[tone][g.kind]} transition-opacity`
        if (!describe) return <span key={`${g.kind}${g.from}`} className={cls} style={style} />
        const text = describe(g)
        return (
          <button
            key={`${g.kind}${g.from}`}
            type="button"
            aria-label={text}
            title={text}
            onMouseEnter={() => setLit(i)}
            onFocus={() => setLit(i)}
            onBlur={() => setLit(null)}
            onClick={() => setLit(lit === i ? null : i)}
            className={`${cls} cursor-default p-0`}
            style={style}
          />
        )
      })}
    </span>
  )

  if (!marks?.length && !pins?.length && !describe) return <span className={`block ${className}`}>{bar}</span>
  const shown = lit !== null ? segs[lit] : null
  return (
    <div className={className}>
      {marks && marks.length > 0 && (
        <div aria-hidden className="relative h-5">
          {marks.map((m) => (
            <span key={m.label} className={`absolute top-0 ${m.accent ? 'text-brand-500' : 'text-neutral-900'}`} style={{ left: `${pct(m.at).toFixed(2)}%` }}>
              <span className="absolute top-0 whitespace-nowrap text-[11px] font-bold" style={{ transform: `translateX(${edge(pct(m.at))})` }}>
                {m.label}
              </span>
              <span className="absolute top-[14px] -ml-[5px] h-0 w-0 border-x-[5px] border-t-[6px] border-x-transparent border-t-current" />
            </span>
          ))}
        </div>
      )}
      {bar}
      {pins && pins.length > 0 && (
        <div aria-hidden className="relative h-[38px]">
          {pins.map((p) => (
            <span key={p.at} className="absolute top-1.5 flex -translate-x-1/2 flex-col items-center gap-0.5" style={{ left: `${pct(p.at).toFixed(2)}%` }}>
              {p.dots.map((d) => (
                <span key={d.key} title={d.label} className={`flex h-4 w-4 items-center justify-center rounded-full ${d.tone}`}>
                  {d.icon}
                </span>
              ))}
            </span>
          ))}
        </div>
      )}
      {shown && describe && (
        <p aria-live="polite" className={`mt-1 truncate text-[11.5px] font-semibold ${tone === 'hero' ? 'text-white/80' : 'text-neutral-600'}`}>
          {describe(shown)}
        </p>
      )}
    </div>
  )
}

/** The swatch for a legend entry. */
export function DayBarSwatch({ kind, tone = 'card', big = false }: { kind: SegKind; tone?: Tone; big?: boolean }) {
  return <span className={`shrink-0 ${big ? 'h-3 w-3 rounded' : 'h-2.5 w-2.5 rounded-[3px]'} ${FILL[tone][kind]}`} />
}
