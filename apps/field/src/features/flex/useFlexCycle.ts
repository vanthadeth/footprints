import { useCallback, useEffect, useState } from 'react'
import { flexService } from './flexService'
import type { FlexCycle } from './flex'

/** The signed-in person's cycle containing `date` (today by default); null while loading or on error. */
export function useFlexCycle(date: string | null = null) {
  const [cycle, setCycle] = useState<FlexCycle | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    flexService
      .cycle(null, date)
      .then((c) => {
        if (cancelled) return
        setCycle(c)
        setError(null)
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : 'Couldn’t load your days off.'))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [date, nonce])

  const reload = useCallback(() => setNonce((n) => n + 1), [])
  return { cycle, loading, error, reload }
}
