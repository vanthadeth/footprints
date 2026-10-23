import { TIER_BADGE } from './coverage'
import type { Tier } from './coverageService'

/** The small square A / B / C tier marker. */
export function TierBadge({ tier, className = '' }: { tier: string; className?: string }) {
  const t = (['A', 'B', 'C'].includes(tier) ? tier : 'B') as Tier
  return (
    <span
      title={`Tier ${t}`}
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-extrabold ${TIER_BADGE[t]} ${className}`}
    >
      {t}
    </span>
  )
}
