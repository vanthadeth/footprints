import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthContext'
import { conversationsService } from './conversationsService'
import { sortThreads, type ThreadRow } from './threads'

interface MessagesValue {
  threads: ThreadRow[]
  unreadCount: number
  loading: boolean
  error: string | null
  refresh: () => void
  markRead: (postId: string) => Promise<void>
  markAllRead: () => Promise<void>
}

const MessagesContext = createContext<MessagesValue | null>(null)

const POLL_FALLBACK_MS = 60_000

/**
 * The caller's Messages list (my_conversation_threads), shared by the
 * title-bar bell, the Hub row and the Messages page -- one realtime channel
 * for the whole app shell, for the same reason NotificationsProvider exists.
 */
export function MessagesProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const signedIn = session != null
  const [threads, setThreads] = useState<ThreadRow[]>([])
  const [loading, setLoading] = useState(signedIn)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setThreads(sortThreads(await conversationsService.threads()))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load messages.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!signedIn) return
    load()
    let timer: ReturnType<typeof setTimeout> | null = null
    const soon = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(load, 400)
    }
    const channel = supabase
      .channel('messages-threads')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customer_posts' }, soon)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customer_post_replies' }, soon)
      .subscribe()
    const poll = setInterval(load, POLL_FALLBACK_MS)
    return () => {
      if (timer) clearTimeout(timer)
      supabase.removeChannel(channel)
      clearInterval(poll)
    }
  }, [signedIn, load])

  const markRead = useCallback(
    async (postId: string) => {
      setThreads((ts) => ts.map((t) => (t.post_id === postId ? { ...t, unread_count: 0 } : t)))
      await conversationsService.markRead(postId)
    },
    []
  )

  const markAllRead = useCallback(async () => {
    setThreads((ts) => ts.map((t) => ({ ...t, unread_count: 0 })))
    await conversationsService.markAllRead()
    load()
  }, [load])

  const unreadCount = threads.reduce((n, t) => n + t.unread_count, 0)

  return (
    <MessagesContext.Provider value={{ threads, unreadCount, loading, error, refresh: load, markRead, markAllRead }}>{children}</MessagesContext.Provider>
  )
}

export function useMessages(): MessagesValue {
  const ctx = useContext(MessagesContext)
  if (!ctx) throw new Error('useMessages must be used within a MessagesProvider')
  return ctx
}
