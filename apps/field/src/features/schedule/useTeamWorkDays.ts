import { useEffect, useState } from 'react'
import { scheduleService, type PersonWorkDay } from './scheduleService'

/**
 * Each person's own work day on `date` (default today), by user id: their
 * hours and unpaid break. Team screens read a colleague's shift from here, not
 * from the signed-in person's schedule. Empty until loaded (and if it can't be
 * read), so callers fall back to something neutral.
 */
export function useTeamWorkDays(date?: string): Record<string, PersonWorkDay> {
  const [days, setDays] = useState<Record<string, PersonWorkDay>>({})

  useEffect(() => {
    let cancelled = false
    scheduleService
      .teamWorkDays(date)
      .then((rows) => {
        if (cancelled) return
        setDays(Object.fromEntries(rows.map((r) => [r.userId, r])))
      })
      .catch(() => {
        if (!cancelled) setDays({})
      })
    return () => {
      cancelled = true
    }
  }, [date])

  return days
}
