import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { conversationsService, type PostRow, type ReplyRow } from './conversationsService'

interface ConversationState {
  posts: PostRow[]
  replies: Record<string, ReplyRow[]>
  loading: boolean
  error: string | null
}

function groupReplies(rows: ReplyRow[]): Record<string, ReplyRow[]> {
  const out: Record<string, ReplyRow[]> = {}
  for (const r of rows) (out[r.post_id] ??= []).push(r)
  return out
}

/**
 * Posts + replies for one customer's conversation, or for a single post
 * (the Messages thread view), kept live with a realtime subscription on
 * the three conversation tables (0093 adds them to supabase_realtime).
 */
export function useConversation(target: { customerId: string } | { postId: string } | null) {
  const [state, setState] = useState<ConversationState>({ posts: [], replies: {}, loading: target != null, error: null })
  const key = target == null ? null : 'customerId' in target ? `c:${target.customerId}` : `p:${target.postId}`
  const postIds = useRef<Set<string>>(new Set())

  const load = useCallback(async () => {
    if (!key) return
    try {
      const [kind, id] = [key.slice(0, 1), key.slice(2)]
      const posts = kind === 'c' ? await conversationsService.feed(id) : [await conversationsService.post(id)].filter((p): p is PostRow => p != null)
      const replies = await conversationsService.replies(posts.map((p) => p.id))
      postIds.current = new Set(posts.map((p) => p.id))
      setState({ posts, replies: groupReplies(replies), loading: false, error: null })
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: e instanceof Error ? e.message : 'Failed to load the conversation.' }))
    }
  }, [key])

  useEffect(() => {
    if (!key) return
    setState((s) => ({ ...s, loading: true }))
    load()

    let timer: ReturnType<typeof setTimeout> | null = null
    const soon = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(load, 250)
    }
    const touches = (row: unknown) => {
      const r = row as { post_id?: string; id?: string; customer_id?: string } | null
      if (!r) return true
      if (r.post_id) return postIds.current.has(r.post_id)
      if (key.startsWith('c:')) return r.customer_id === key.slice(2)
      return r.id === key.slice(2)
    }
    const channel = supabase
      .channel(`conversation-${key}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customer_posts' }, (e) => {
        if (touches(e.new) || touches(e.old)) soon()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customer_post_replies' }, (e) => {
        if (touches(e.new) || touches(e.old)) soon()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customer_post_reactions' }, () => soon())
      .subscribe()

    return () => {
      if (timer) clearTimeout(timer)
      supabase.removeChannel(channel)
    }
  }, [key, load])

  return { ...state, refresh: load }
}
