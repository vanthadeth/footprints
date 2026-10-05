import { useSearchParams } from 'react-router-dom'

/** Segmented tabs whose choice lives in ?tab= so a refresh or a link lands on the same tab. */
export function useTab<T extends string>(tabs: readonly T[], fallback: T): [T, (t: T) => void] {
  const [params, setParams] = useSearchParams()
  const raw = params.get('tab') as T | null
  const tab = raw && tabs.includes(raw) ? raw : fallback
  const set = (t: T) => {
    const next = new URLSearchParams(params)
    next.set('tab', t)
    setParams(next, { replace: true })
  }
  return [tab, set]
}
