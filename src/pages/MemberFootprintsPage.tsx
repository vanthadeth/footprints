import { useEffect, useState } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import { JourneyHistoryReport } from '@/features/attendance/JourneyHistoryReport'
import { calendarService } from '@/features/calendar/calendarService'
import { displayName } from '@/lib/displayName'

/**
 * One team member's footprints (Team › a name in People): who it is, then
 * the same day-by-day journey as your own Footprints, read-only. The name
 * comes with the link; opened straight from a URL it's looked up in my_team.
 */
export function MemberFootprintsPage() {
  const { userId } = useParams()
  const passed = (useLocation().state as { name?: string; sub?: string } | null) ?? null
  const [name, setName] = useState<string | null>(passed?.name ?? null)

  useEffect(() => {
    if (name || !userId) return
    calendarService
      .team()
      .then((team) => {
        const p = team.find((x) => x.id === userId)
        if (p) setName(displayName(p.full_name, p.nickname))
      })
      .catch(() => {})
  }, [name, userId])

  if (!userId) return null
  const initials = (name ?? '?')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <>
      <div className="mx-auto flex max-w-lg items-center gap-3 px-4 pb-2 pt-3 md:max-w-3xl md:px-8">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[15px] font-extrabold text-brand-700 dark:bg-brand-500/20 dark:text-brand-100">{initials}</span>
        <span className="min-w-0">
          <span className="block truncate text-[17px] font-bold text-neutral-900">{name ?? 'Team member'}</span>
          {passed?.sub && <span className="block truncate text-[13px] text-neutral-500">{passed.sub}</span>}
        </span>
      </div>
      <JourneyHistoryReport userId={userId} interactive={false} subtitle={name ?? undefined} />
    </>
  )
}
