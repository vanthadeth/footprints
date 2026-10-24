import type { CallDirection, CallPurpose, ConversationKind } from './conversationMeta'

export type ThreadReason = 'mention' | 'reply' | 'mine' | 'due'
export type ThreadFilter = 'all' | ThreadReason

/** One row of my_conversation_threads (0093). Declared by hand, like the other read models. */
export interface ThreadRow {
  post_id: string
  customer_id: string
  customer_name: string | null
  kind: ConversationKind
  direction: CallDirection | null
  purposes: CallPurpose[]
  outcome_payment: string | null
  outcome_order: string | null
  outcome_delivery: string | null
  outcome_conflict: string | null
  follow_up_at: string | null
  reason: ThreadReason
  is_mention: boolean
  is_reply: boolean
  is_mine: boolean
  is_due: boolean
  last_author_id: string | null
  last_author_name: string | null
  last_body: string | null
  last_at: string
  unread_count: number
}

export const THREAD_FILTERS: { key: ThreadFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'mention', label: 'Mentions' },
  { key: 'reply', label: 'Replies' },
  { key: 'mine', label: 'My customers' },
  { key: 'due', label: 'Follow-ups due' },
]

export const REASON_LABEL: Record<ThreadReason, string> = {
  mention: 'Mentioned you',
  reply: 'Replied to you',
  mine: 'Your customer',
  due: 'Follow-up due',
}

/** A thread shows under a filter when that reason applies at all, not only when it's the headline reason. */
export function matchesFilter(t: ThreadRow, filter: ThreadFilter): boolean {
  switch (filter) {
    case 'all':
      return true
    case 'mention':
      return t.is_mention
    case 'reply':
      return t.is_reply
    case 'mine':
      return t.is_mine
    case 'due':
      return t.is_due
  }
}

export function filterCounts(threads: ThreadRow[]): Record<ThreadFilter, number> {
  const out = { all: 0, mention: 0, reply: 0, mine: 0, due: 0 } as Record<ThreadFilter, number>
  for (const f of THREAD_FILTERS) out[f.key] = threads.filter((t) => matchesFilter(t, f.key)).length
  return out
}

/** Newest activity first; a due follow-up with no newer activity still sorts by its last message. */
export function sortThreads(threads: ThreadRow[]): ThreadRow[] {
  return [...threads].sort((a, b) => b.last_at.localeCompare(a.last_at))
}

export function unreadSummary(threads: ThreadRow[]): { messages: number; threads: number; text: string } {
  const messages = threads.reduce((n, t) => n + t.unread_count, 0)
  const withUnread = threads.filter((t) => t.unread_count > 0).length
  const text = messages ? `${messages} unread in ${withUnread} ${withUnread === 1 ? 'conversation' : 'conversations'}` : 'All caught up'
  return { messages, threads: withUnread, text }
}
