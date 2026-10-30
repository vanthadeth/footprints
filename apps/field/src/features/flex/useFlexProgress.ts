import { useCallback, useEffect, useState } from 'react'
import { flexService } from './flexService'
import type { FlexProgress } from './progress'

/** The signed-in person's cycle containing `date` (today by default); null while loading or on error. */
export function useFlexProgress(date: string | null = null) {
  const [progress, setProgress] = useState<FlexProgress | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    flexService
      .progress(null, date)
      .then((p) => {
        if (cancelled) return
        setProgress(p)
        setError(null)
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : 'Couldn’t load your working days.'))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [date, nonce])

  const reload = useCallback(() => setNonce((n) => n + 1), [])
  return { progress, loading, error, reload }
}
