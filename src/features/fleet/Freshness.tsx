import { useEffect, useState } from 'react'
import { Clock } from 'lucide-react'
import { timeAgo } from '@/lib/datetime'
import { DEFAULT_LOCATION_PING_INTERVAL_MINUTES } from '@/lib/config'

/** "Updated Xm ago", visually flagged once data is stale enough that it should never be mistaken for live (spec §36). */
export function Freshness({ at, label = 'Updated' }: { at: string | null; label?: string }) {
  const [, forceTick] = useState(0)

  useEffect(() => {
    const t = setInterval(() => forceTick((n) => n + 1), 30_000)
    return () => clearInterval(t)
  }, [])

  if (!at) return <span className="text-xs text-neutral-400">No data yet</span>

  const ageMinutes = (Date.now() - new Date(at).getTime()) / 60_000
  const stale = ageMinutes > DEFAULT_LOCATION_PING_INTERVAL_MINUTES * 3

  return (
    <span className={`flex items-center gap-1 text-xs ${stale ? 'font-medium text-status-warn' : 'text-neutral-400'}`}>
      <Clock className="h-3 w-3" />
      {label} {timeAgo(at)}
    </span>
  )
}
