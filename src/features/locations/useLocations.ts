import { useEffect, useState } from 'react'
import { locationsService, type WorkLocationRow } from './locationsService'

interface UseLocationsResult {
  locations: WorkLocationRow[]
  loading: boolean
  error: string | null
  refresh: () => void
}

/** The admin-managed work_locations list -- same nonce-refetch shape as useCustomers.ts. */
export function useLocations(): UseLocationsResult {
  const [locations, setLocations] = useState<WorkLocationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    locationsService
      .list()
      .then((rows) => {
        if (!cancelled) setLocations(rows)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load locations.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [nonce])

  return { locations, loading, error, refresh: () => setNonce((n) => n + 1) }
}
