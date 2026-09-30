import { useEffect, useState } from 'react'

const QUERY = '(min-width: 768px)'

/** True at the md breakpoint and up -- for screens whose phone and desktop layouts differ in structure, not just spacing. */
export function useIsDesktop(): boolean {
  const [desktop, setDesktop] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(QUERY).matches)
  useEffect(() => {
    const mq = window.matchMedia?.(QUERY)
    if (!mq) return
    const on = () => setDesktop(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return desktop
}
