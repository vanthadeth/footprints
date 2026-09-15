import { createContext, useContext, type ReactNode } from 'react'
import { useProfile } from '@/features/auth/useProfile'
import { useNotifications } from './useNotifications'

type NotificationsContextValue = ReturnType<typeof useNotifications>

const NotificationsContext = createContext<NotificationsContextValue | null>(null)

/**
 * Wraps the authenticated app shell so every consumer (NotificationBell in
 * TitleBar -- persistent across every screen -- plus MorePage/MenuPage's
 * nav row and NotificationsPage itself) shares one realtime subscription
 * instead of each calling useNotifications() independently. Two instances
 * both calling `supabase.channel('notifications-feed')` at once -- e.g. the
 * always-mounted bell plus whichever page badge/screen happens to also be
 * mounted -- throws ("cannot add postgres_changes callbacks... after
 * subscribe()") the moment the second one calls .on() on the channel the
 * first already subscribed. One shared instance here, like JourneyProvider
 * does for useJourney, avoids that entirely.
 */
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { profile } = useProfile()
  const notifications = useNotifications(profile?.is_super_admin === true)
  return <NotificationsContext.Provider value={notifications}>{children}</NotificationsContext.Provider>
}

export function useNotificationsContext(): NotificationsContextValue {
  const ctx = useContext(NotificationsContext)
  if (!ctx) throw new Error('useNotificationsContext must be used within a NotificationsProvider')
  return ctx
}
