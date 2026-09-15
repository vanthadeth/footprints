import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { notificationsService, type NotificationFeedRow } from './notificationsService'

interface NotificationsState {
  notifications: NotificationFeedRow[]
  unreadCount: number
  loading: boolean
  error: string | null
}

const POLL_FALLBACK_MS = 60_000

/**
 * Same realtime-subscription + polling-fallback shape as useFleet.ts --
 * `notifications` is in the supabase_realtime publication (see the
 * notifications_center migration), so this gets near-live updates with a
 * 60s poll as a belt-and-suspenders fallback if an event is missed.
 *
 * `enabled` (default true) lets a caller that only conditionally shows a
 * notifications row/badge (e.g. MorePage, only for a super admin) skip the
 * fetch + realtime subscription entirely for everyone else, without
 * breaking the Rules of Hooks by calling this conditionally -- RLS would
 * return an empty result for a non-super-admin anyway, but there's no
 * reason to open a channel and poll for that empty result.
 */
export function useNotifications(
  enabled: boolean = true
): NotificationsState & { refresh: () => void; markRead: (id: string) => Promise<void> } {
  const [state, setState] = useState<NotificationsState>({ notifications: [], unreadCount: 0, loading: enabled, error: null })

  const load = useCallback(async () => {
    try {
      const notifications = await notificationsService.list()
      setState({ notifications, unreadCount: notifications.filter((n) => !n.read_at).length, loading: false, error: null })
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: e instanceof Error ? e.message : 'Failed to load notifications.' }))
    }
  }, [])

  useEffect(() => {
    if (!enabled) return

    load()

    const channel = supabase
      .channel('notifications-feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, () => load())
      .subscribe()

    const poll = setInterval(load, POLL_FALLBACK_MS)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(poll)
    }
  }, [enabled, load])

  async function markRead(id: string) {
    // Optimistic -- the realtime event for our own update will reconcile
    // this shortly anyway, but no reason to wait for the round trip.
    setState((s) => ({
      ...s,
      notifications: s.notifications.map((n) => (n.id === id ? { ...n, read_at: n.read_at ?? new Date().toISOString() } : n)),
      unreadCount: s.notifications.find((n) => n.id === id && !n.read_at) ? Math.max(0, s.unreadCount - 1) : s.unreadCount,
    }))
    await notificationsService.markRead(id)
  }

  return { ...state, refresh: load, markRead }
}
