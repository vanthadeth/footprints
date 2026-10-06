import { useEffect, useRef } from 'react'
import { pushBackHandler } from '@/features/nav/historyGuard'

/** While `active`, the phone's or browser's Back calls `onBack` (e.g. closes a sheet) instead of leaving the page. */
export function useBackHandler(active: boolean, onBack: () => void) {
  const ref = useRef(onBack)
  ref.current = onBack
  useEffect(() => {
    if (!active) return
    return pushBackHandler(() => ref.current())
  }, [active])
}
