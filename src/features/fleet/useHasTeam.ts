import { useEffect, useState } from 'react'
import { fleetService } from './fleetService'

/**
 * Whether the caller can see anyone besides themselves in `my_team()` --
 * i.e. has subordinates (Sale Manager/Supervisor's `sub` scope) or broader
 * (System Admin's `any` scope), per `app.can('attendance','view', ...)`.
 * Drives Fleet nav visibility for non-super-admins; a one-time fetch is
 * enough since it's just a nav-visibility flag, not live team status.
 */
export function useHasTeam(): boolean {
  const [hasTeam, setHasTeam] = useState(false)

  useEffect(() => {
    let cancelled = false
    fleetService
      .fetchTeam()
      .then((team) => {
        if (!cancelled) setHasTeam(team.length > 1)
      })
      .catch(() => {
        // no-op -- nav just stays hidden for this session on failure
      })
    return () => {
      cancelled = true
    }
  }, [])

  return hasTeam
}
