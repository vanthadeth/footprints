import { useEffect, useState } from 'react'
import { MessagesSquare, PhoneCall } from 'lucide-react'
import { PURPOSES, type CallPurpose } from './conversationMeta'
import { PostCard } from './PostCard'
import { useColleagues } from './useColleagues'
import { useConversation } from './useConversation'

/**
 * A customer's conversation: every logged call and note, newest first,
 * with replies and reactions, filterable by call purpose.
 */
export function ConversationSection({
  customerId,
  meId,
  refreshKey,
  onLogCall,
}: {
  customerId: string
  meId: string | null
  refreshKey: number
  /** Shown as a "Log call" button when the viewer may log calls for this customer. */
  onLogCall?: () => void
}) {
  const { posts, replies, loading, error, refresh } = useConversation({ customerId })
  const colleagues = useColleagues()
  const [filter, setFilter] = useState<CallPurpose | 'all'>('all')

  // The parent bumps refreshKey after logging a call/note from its own sheet.
  useEffect(() => {
    if (refreshKey > 0) refresh()
  }, [refreshKey, refresh])

  const present = PURPOSES.filter((p) => posts.some((post) => post.purposes.includes(p.key)))
  const shown = filter === 'all' ? posts : posts.filter((p) => p.purposes.includes(filter))

  return (
    <section className="mt-4" aria-labelledby="conversation-title">
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <p id="conversation-title" className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
          Conversation
        </p>
        {onLogCall && (
          <button type="button" onClick={onLogCall} className="flex h-8 items-center gap-1.5 rounded-full bg-brand-50 px-3 text-xs font-bold text-brand-600 tap-target">
            <PhoneCall className="h-3.5 w-3.5" aria-hidden /> Log call
          </button>
        )}
      </div>

      {present.length > 0 && (
        <div role="radiogroup" aria-label="Filter by purpose" className="-mx-4 mb-3 flex gap-1.5 overflow-x-auto px-4 pb-1 md:-mx-8 md:px-8">
          {[{ key: 'all' as const, label: `All ${posts.length}` }, ...present.map((p) => ({ key: p.key, label: p.label }))].map((f) => {
            const on = filter === f.key
            return (
              <button
                key={f.key}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setFilter(f.key)}
                className={`h-8 shrink-0 whitespace-nowrap rounded-full border px-3 text-xs font-semibold tap-target ${
                  on ? 'border-neutral-900 bg-white text-neutral-900 dark:border-neutral-100' : 'border-neutral-200 bg-white text-neutral-500'
                }`}
              >
                {f.label}
              </button>
            )
          })}
        </div>
      )}

      {loading && posts.length === 0 ? (
        <div className="space-y-2">
          <div className="h-28 animate-pulse rounded-2xl bg-neutral-100" />
          <div className="h-20 animate-pulse rounded-2xl bg-neutral-100" />
        </div>
      ) : error ? (
        <p className="rounded-lg bg-status-danger/10 px-3 py-2 text-sm text-status-danger">{error}</p>
      ) : shown.length === 0 ? (
        <div className="flex items-center gap-3 rounded-2xl border border-dashed border-neutral-200 p-4">
          <MessagesSquare className="h-5 w-5 shrink-0 text-neutral-400" aria-hidden />
          <p className="text-sm text-neutral-500">No calls or notes yet. Log a call after you speak with this customer so the team can follow along.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {shown.map((p) => (
            <PostCard key={p.id} post={p} replies={replies[p.id] ?? []} meId={meId} colleagues={colleagues} onChanged={refresh} />
          ))}
        </div>
      )}
    </section>
  )
}
