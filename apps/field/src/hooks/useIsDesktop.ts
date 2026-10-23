import { useEffect, useState } from 'react'

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(query).matches)
  useEffect(() => {
    const mq = window.matchMedia?.(query)
    if (!mq) return
    const on = () => setMatches(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [query])
  return matches
}

/** True at the md breakpoint and up -- for screens whose phone and desktop layouts differ in structure, not just spacing. */
export function useIsDesktop(): boolean {
  return useMediaQuery('(min-width: 768px)')
}

/** True at the lg breakpoint (1024px) and up: the full desktop UI -- top bar, wide pages, tables and side panels. Tablets stay on the phone-width layout. */
export function useIsWide(): boolean {
  return useMediaQuery('(min-width: 1024px)')
}
