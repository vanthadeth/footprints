import { useEffect, useState } from 'react'
import { fleetService } from './fleetService'
import type { TeamMember } from './types'

/** Everyone the caller can see (app.my_team): the whole company for HR and admins, a manager's reports for managers. Loaded once. */
export function useTeam(): { team: TeamMember[]; loading: boolean; error: string | null } {
  const [state, setState] = useState<{ team: TeamMember[]; loading: boolean; error: string | null }>({ team: [], loading: true, error: null })
  useEffect(() => {
    let cancelled = false
    fleetService
      .fetchTeam()
      .then((team) => !cancelled && setState({ team, loading: false, error: null }))
      .catch((e) => !cancelled && setState({ team: [], loading: false, error: e instanceof Error ? e.message : 'Could not load people.' }))
    return () => {
      cancelled = true
    }
  }, [])
  return state
}
