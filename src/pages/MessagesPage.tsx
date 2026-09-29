import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AtSign, CalendarClock, CornerUpLeft, MessagesSquare, User } from 'lucide-react'
import { useMessages } from '@/features/conversations/MessagesContext'
import { Initials, PurposeTags } from '@/features/conversations/ConversationBits'
import { REASON_LABEL, THREAD_FILTERS, filterCounts, matchesFilter, unreadSummary, type ThreadFilter, type ThreadReason } from '@/features/conversations/threads'
import { formatFollowUpAt } from '@/features/conversations/followUp'
import { timeAgo } from '@/lib/datetime'

const REASON_STYLE: Record<ThreadReason, { icon: typeof AtSign; tone: string }> = {
  mention: { icon: AtSign, tone: 'bg-status-visiting text-white' },
  reply: { icon: CornerUpLeft, tone: 'bg-brand-500 text-white' },
  mine: { icon: User, tone: 'bg-status-working text-white' },
  due: { icon: CalendarClock, tone: 'bg-status-warn text-white' },
}

const REASON_TEXT: Record<ThreadReason, string> = {
  mention: 'text-status-visiting dark:text-violet-300',
  reply: 'text-brand-600',
  mine: 'text-status-working dark:text-emerald-300',
  due: 'text-status-warn dark:text-orange-300',
}

/**
 * Messages (/messages): every customer conversation that concerns me --
 * I'm mentioned or notified, someone replied to me, it's my customer, or
 * my follow-up is due -- newest first, with unread counts. Tap to open.
 */
export function MessagesPage() {
  const { threads, loading, error, markAllRead } = useMessages()
  const [filter, setFilter] = useState<ThreadFilter>('all')
  const counts = filterCounts(threads)
  const shown = threads.filter((t) => matchesFilter(t, filter))
  const summary = unreadSummary(threads)

  return (
    <div className="mx-auto max-w-lg space-y-3 px-4 pb-6 pt-1 md:max-w-2xl md:px-8 md:pt-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-neutral-500">{loading && threads.length === 0 ? 'Loading…' : summary.text}</p>
        <button
          type="button"
          onClick={markAllRead}
          disabled={summary.messages === 0}
          className="h-9 rounded-full bg-neutral-100 px-3.5 text-[13px] font-bold text-neutral-600 tap-target disabled:opacity-40"
        >
          Mark all read
        </button>
      </div>

      <div role="radiogroup" aria-label="Show" className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 md:-mx-8 md:px-8">
        {THREAD_FILTERS.map((f) => {
          const on = filter === f.key
          return (
            <button
              key={f.key}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setFilter(f.key)}
              className={`flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[13px] font-bold tap-target ${
                on ? 'border-neutral-900 bg-white text-neutral-900 dark:border-neutral-100' : 'border-neutral-200 bg-white text-neutral-500'
              }`}
            >
              {f.label}
              <span className={`rounded-full px-1.5 text-[11px] font-extrabold ${on ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900' : 'bg-neutral-100 text-neutral-500'}`}>
                {counts[f.key]}
              </span>
            </button>
          )
        })}
      </div>

      {error && <p className="rounded-lg bg-status-danger/10 px-3 py-2 text-sm text-status-danger">{error}</p>}

      {loading && threads.length === 0 ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-2xl bg-neutral-100" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl bg-white px-6 py-10 text-center shadow-card">
          <MessagesSquare className="h-8 w-8 text-neutral-300" aria-hidden />
          <p className="text-sm text-neutral-500">{filter === 'all' ? 'Nothing here yet — you’re all caught up.' : 'Nothing in this filter.'}</p>
        </div>
      ) : (
        <ul className="overflow-hidden rounded-2xl bg-white shadow-card">
          {shown.map((t, i) => {
            const R = REASON_STYLE[t.reason]
            const unread = t.unread_count > 0
            const reasonText = t.reason === 'due' && t.follow_up_at ? `Follow-up due · ${formatFollowUpAt(t.follow_up_at)}` : REASON_LABEL[t.reason]
            return (
              <li key={t.post_id} className={i > 0 ? 'border-t border-neutral-100' : ''}>
                <Link
                  to={`/messages/${t.post_id}`}
                  className={`flex gap-3 px-3.5 py-3 ${unread ? 'bg-brand-50' : ''}`}
                  aria-label={`${t.customer_name ?? 'Customer'}, ${REASON_LABEL[t.reason]}${unread ? `, ${t.unread_count} unread` : ''}`}
                >
                  <span className="relative">
                    <Initials name={t.customer_name} />
                    <span className={`absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white ${R.tone}`}>
                      <R.icon className="h-2.5 w-2.5" aria-hidden />
                    </span>
                  </span>
                  <span className="min-w-0 flex-1 space-y-0.5">
                    <span className="flex items-baseline gap-2">
                      <span className={`min-w-0 flex-1 truncate text-[14.5px] text-neutral-900 ${unread ? 'font-extrabold' : 'font-semibold'}`}>{t.customer_name ?? 'Customer'}</span>
                      <span className={`shrink-0 text-xs ${unread ? 'font-bold text-brand-600' : 'text-neutral-400'}`}>{timeAgo(t.last_at)}</span>
                    </span>
                    <span className={`block text-xs font-bold ${REASON_TEXT[t.reason]}`}>{reasonText}</span>
                    <span className="flex items-center gap-2">
                      <span className={`line-clamp-2 min-w-0 flex-1 text-[13px] ${unread ? 'text-neutral-800' : 'text-neutral-500'}`}>
                        {t.last_author_name && <span className="font-bold">{t.last_author_name}: </span>}
                        {t.last_body || (t.kind === 'call' ? 'Logged a call' : 'Added a note')}
                      </span>
                      {unread && (
                        <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-brand-500 px-1.5 text-[11px] font-extrabold text-white">{t.unread_count}</span>
                      )}
                    </span>
                    <span className="block pt-0.5">
                      <PurposeTags purposes={t.purposes} />
                    </span>
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}

      <p className="px-1 text-xs leading-relaxed text-neutral-500">
        A conversation shows here when someone mentions you, replies to you, posts on a customer you look after, or a follow-up of yours is due.
      </p>
    </div>
  )
}
