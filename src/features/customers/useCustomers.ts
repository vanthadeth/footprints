import { useEffect, useState } from 'react'
import { customersService, type CustomerDirectoryRow } from './customersService'

interface UseCustomersResult {
  customers: CustomerDirectoryRow[]
  loading: boolean
  error: string | null
  refresh: () => void
}

/** The shared customer book (see customersService) -- search/filter/sort all live in the page, this just fetches. */
export function useCustomers(): UseCustomersResult {
  const [customers, setCustomers] = useState<CustomerDirectoryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    customersService
      .list()
      .then((rows) => {
        if (!cancelled) setCustomers(rows)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load customers.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [nonce])

  return { customers, loading, error, refresh: () => setNonce((n) => n + 1) }
}
