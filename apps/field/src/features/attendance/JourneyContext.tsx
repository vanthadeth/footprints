import { createContext, useContext, type ReactNode } from 'react'
import { useJourney } from './useJourney'

type JourneyContextValue = ReturnType<typeof useJourney>

const JourneyContext = createContext<JourneyContextValue | null>(null)

/**
 * Wraps the authenticated app shell so every screen shares one `useJourney`
 * instance. Calling the hook a second time (e.g. from AppLayout, to show
 * the bottom nav's Clock In/Check In label) would double its side effects:
 * the initial attendance/visit load, and -- worse -- the location-ping
 * interval that fires while a visit is open.
 */
export function JourneyProvider({ children }: { children: ReactNode }) {
  const journey = useJourney()
  return <JourneyContext.Provider value={journey}>{children}</JourneyContext.Provider>
}

export function useJourneyContext(): JourneyContextValue {
  const ctx = useContext(JourneyContext)
  if (!ctx) throw new Error('useJourneyContext must be used within a JourneyProvider')
  return ctx
}
