import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { callRpc } from '@/lib/rpc'
import { outcomeArgs, type CallDirection, type CallPurpose, type Colleague, type ConversationKind, type Outcomes, type ReactionKey } from './conversationMeta'
import type { ThreadRow } from './threads'

/** One row of customer_conversation_feed (0093). Declared by hand: the generated view types mark every column nullable. */
export interface PostRow {
  id: string
  customer_id: string
  customer_name: string | null
  customer_owner_id: string | null
  author_id: string
  author_name: string | null
  kind: ConversationKind
  direction: CallDirection | null
  purposes: CallPurpose[]
  body: string
  outcome_payment: string | null
  outcome_order: string | null
  outcome_delivery: string | null
  outcome_conflict: string | null
  follow_up_at: string | null
  follow_up_done_at: string | null
  created_at: string
  reply_count: number
  reaction_counts: Partial<Record<ReactionKey, number>>
  my_reactions: ReactionKey[]
  notified: { user_id: string; name: string | null; reason: 'mention' | 'notify' }[]
}

/** One row of customer_conversation_replies (0093). */
export interface ReplyRow {
  id: string
  post_id: string
  author_id: string
  author_name: string | null
  reply_to_id: string | null
  reply_to_name: string | null
  body: string
  created_at: string
  reaction_counts: Partial<Record<ReactionKey, number>>
  my_reactions: ReactionKey[]
  mentions_me: boolean
}

export interface LogPostInput {
  customerId: string
  kind: ConversationKind
  direction?: CallDirection | null
  purposes?: CallPurpose[]
  body?: string
  outcomes?: Outcomes
  followUpAt?: string | null
  notify?: string[]
  mentions?: string[]
}

type ViewQuery = PromiseLike<{ data: unknown; error: PostgrestError | null }> & {
  eq(column: string, value: unknown): ViewQuery
  in(column: string, values: unknown[]): ViewQuery
  order(column: string, opts?: { ascending?: boolean }): ViewQuery
  limit(n: number): ViewQuery
  maybeSingle(): ViewQuery
}

/**
 * Reads one of the 0093 read-model views. Untyped on purpose, like
 * callRpc: the rows are declared by hand above (the generated view types
 * mark every column nullable), so this doesn't depend on regenerated types.
 */
function fromView(view: 'customer_conversation_feed' | 'customer_conversation_replies' | 'my_conversation_threads') {
  const from = supabase.from.bind(supabase) as unknown as (name: string) => { select(columns: string): ViewQuery }
  return from(view)
}

/**
 * Customer conversations (0093): reads go through the security_invoker
 * views (RLS decides what the caller sees); every write is an RPC that
 * re-checks customer_conversation permissions server-side.
 */
export const conversationsService = {
  async feed(customerId: string, limit = 50): Promise<PostRow[]> {
    const { data, error } = await fromView('customer_conversation_feed')
      .select('*')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) throw error
    return (data ?? []) as unknown as PostRow[]
  },

  async post(postId: string): Promise<PostRow | null> {
    const { data, error } = await fromView('customer_conversation_feed').select('*').eq('id', postId).maybeSingle()
    if (error) throw error
    return (data as unknown as PostRow | null) ?? null
  },

  async replies(postIds: string[]): Promise<ReplyRow[]> {
    if (postIds.length === 0) return []
    const { data, error } = await fromView('customer_conversation_replies')
      .select('*')
      .in('post_id', postIds)
      .order('created_at', { ascending: true })
    if (error) throw error
    return (data ?? []) as unknown as ReplyRow[]
  },

  async threads(limit = 200): Promise<ThreadRow[]> {
    const { data, error } = await fromView('my_conversation_threads').select('*').order('last_at', { ascending: false }).limit(limit)
    if (error) throw error
    return (data ?? []) as unknown as ThreadRow[]
  },

  canLog(customerId: string): Promise<boolean> {
    return callRpc<boolean>('can_log_conversation', { p_customer_id: customerId })
  },

  colleagues(): Promise<Colleague[]> {
    return callRpc<Colleague[]>('mentionable_users')
  },

  logPost(input: LogPostInput): Promise<{ id: string }> {
    return callRpc<{ id: string }>('log_customer_post', {
      p_customer_id: input.customerId,
      p_kind: input.kind,
      p_direction: input.kind === 'call' ? (input.direction ?? 'outgoing') : null,
      p_purposes: input.purposes ?? [],
      p_body: input.body ?? '',
      ...outcomeArgs(input.outcomes ?? {}),
      p_follow_up_at: input.followUpAt ?? null,
      p_notify: input.notify ?? [],
      p_mentions: input.mentions ?? [],
    })
  },

  reply(postId: string, body: string, replyToId: string | null, mentions: string[]): Promise<{ id: string }> {
    return callRpc<{ id: string }>('add_conversation_reply', { p_post_id: postId, p_body: body, p_reply_to_id: replyToId, p_mentions: mentions })
  },

  toggleReaction(postId: string, reaction: ReactionKey, replyId: string | null = null): Promise<boolean> {
    return callRpc<boolean>('toggle_conversation_reaction', { p_post_id: postId, p_reaction: reaction, p_reply_id: replyId })
  },

  async completeFollowUp(postId: string, done = true): Promise<void> {
    await callRpc('complete_follow_up', { p_post_id: postId, p_done: done })
  },

  async markRead(postId: string): Promise<void> {
    await callRpc('mark_conversation_read', { p_post_id: postId })
  },

  markAllRead(): Promise<number> {
    return callRpc<number>('mark_all_conversations_read')
  },
}

/** Supabase errors carry the server's explanation in `details` (raise ... using detail = ...). */
export function conversationErrorMessage(e: unknown, fallback: string): string {
  if (e && typeof e === 'object') {
    const err = e as { details?: string | null; message?: string }
    if (err.details) return err.details
    if (err.message === 'insufficient_privilege') return 'You don’t have permission to do that for this customer.'
    if (err.message) return err.message
  }
  return fallback
}
