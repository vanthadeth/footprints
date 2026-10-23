import { useEffect, useState } from 'react'
import { visitOptionsService, type VisitOption, type VisitOptionKind } from './visitOptionsService'

interface State {
  byKind: Record<VisitOptionKind, VisitOption[]>
  loading: boolean
  error: string | null
}

const EMPTY: Record<VisitOptionKind, VisitOption[]> = {
  visit_type: [],
  visit_status: [],
  order_status: [],
  payment_status: [],
}

/** Loads the visit_options lookup table once (it's a small, rarely-changing admin-managed list) and groups it by kind for the visit record form. */
export function useVisitOptions(): State {
  const [state, setState] = useState<State>({ byKind: EMPTY, loading: true, error: null })

  useEffect(() => {
    let cancelled = false
    visitOptionsService
      .listActive()
      .then((options) => {
        if (cancelled) return
        const byKind = { ...EMPTY }
        for (const o of options) byKind[o.kind] = [...byKind[o.kind], o]
        setState({ byKind, loading: false, error: null })
      })
      .catch((e) => {
        if (cancelled) return
        setState({ byKind: EMPTY, loading: false, error: e instanceof Error ? e.message : 'Failed to load visit options.' })
      })
    return () => {
      cancelled = true
    }
  }, [])

  return state
}
