import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { fleetService } from './fleetService'
import type { FleetMemberSnapshot } from './types'

interface FleetState {
  snapshots: FleetMemberSnapshot[]
  loading: boolean
  error: string | null
  /** When this snapshot was last actually refreshed -- drives the "Updated Xm ago" freshness indicator, never faked. */
  lastUpdatedAt: number | null
}

const POLL_FALLBACK_MS = 60_000

/**
 * Fleet status for everyone the caller can see (per app.my_team /
 * app.can('attendance','view',...)). Combines an initial fetch, a Realtime
 * subscription for near-live updates, and a polling fallback so the screen
 * is never silently stale if a Realtime event is missed (spec §36).
 */
export function useFleet(): FleetState & { refresh: () => void } {
  const [state, setState] = useState<FleetState>({ snapshots: [], loading: true, error: null, lastUpdatedAt: null })
  const teamRef = useRef<Awaited<ReturnType<typeof fleetService.fetchTeam>>>([])

  const load = useCallback(async (isInitial: boolean) => {
    try {
      if (isInitial) teamRef.current = await fleetService.fetchTeam()
      const snapshots = await fleetService.fetchSnapshot(teamRef.current)
      setState({ snapshots, loading: false, error: null, lastUpdatedAt: Date.now() })
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: e instanceof Error ? e.message : 'Failed to load fleet status.' }))
    }
  }, [])

  useEffect(() => {
    load(true)

    const channel = supabase
      .channel('fleet-status')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance' }, () => load(false))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'visits' }, () => load(false))
      .subscribe()

    const poll = setInterval(() => load(false), POLL_FALLBACK_MS)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(poll)
    }
  }, [load])

  return { ...state, refresh: () => load(true) }
}
