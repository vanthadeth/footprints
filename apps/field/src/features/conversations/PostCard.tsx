import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AtSign, CalendarClock, Check, MessageCircle, SmilePlus } from 'lucide-react'
import { formatTime, timeAgo } from '@/lib/datetime'
import { kindLabel, type Colleague, type ReactionKey } from './conversationMeta'
import { Initials, KindIcon, MessageText, OutcomeChips, PurposeTags, ReactionBar } from './ConversationBits'
import { conversationsService, type PostRow, type ReplyRow } from './conversationsService'
import { formatFollowUpAt, isFollowUpDue } from './followUp'
import { ReplyComposer } from './ReplyComposer'
import { colleagueName } from './useColleagues'

const COLLAPSED_REPLIES = 2

/**
 * One logged call or note: who and how, purposes, the message, outcome
 * chips, follow-up, reactions, then its replies (collapsed to the latest
 * two unless `expanded`) with Like/Reply and a reply box.
 */
export function PostCard({
  post,
  replies,
  meId,
  colleagues,
  onChanged,
  expanded: expandedProp = false,
  showCustomer = false,
}: {
  post: PostRow
  replies: ReplyRow[]
  meId: string | null
  colleagues: Colleague[]
  onChanged: () => void
  expanded?: boolean
  showCustomer?: boolean
}) {
  const [expanded, setExpanded] = useState(expandedProp)
  const [composerOpen, setComposerOpen] = useState(expandedProp)
  const [replyTo, setReplyTo] = useState<{ id: string; name: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const names = colleagues.map(colleagueName)

  const shown = expanded ? replies : replies.slice(-COLLAPSED_REPLIES)
  const hidden = replies.length - shown.length
  const followDue = post.follow_up_at && !post.follow_up_done_at && isFollowUpDue(post.follow_up_at)

  async function react(key: ReactionKey, replyId: string | null = null) {
    await conversationsService.toggleReaction(post.id, key, replyId)
    if (!replyId) setPickerOpen(false)
    onChanged()
  }

  async function toggleDone() {
    setBusy(true)
    try {
      await conversationsService.completeFollowUp(post.id, !post.follow_up_done_at)
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  return (
    <article className="rounded-2xl bg-white p-4 shadow-card" aria-label={`${kindLabel(post.kind, post.direction)} by ${post.author_name ?? 'someone'}`}>
      <header className="flex items-start gap-3">
        <Initials name={post.author_name} />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
            <span className="font-bold text-neutral-900">{post.author_name ?? 'Someone'}</span>
            <span className="text-xs text-neutral-400">
              {timeAgo(post.created_at)} · {formatTime(post.created_at)}
            </span>
          </p>
          <p className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-neutral-500">
            <KindIcon kind={post.kind} direction={post.direction} /> {kindLabel(post.kind, post.direction)}
            {showCustomer && post.customer_name && (
              <>
                {' · '}
                <Link to={`/customers/${post.customer_id}`} className="truncate text-brand-600">
                  {post.customer_name}
                </Link>
              </>
            )}
          </p>
        </div>
      </header>

      <div className="mt-3 space-y-2.5">
        <PurposeTags purposes={post.purposes} />
        <OutcomeChips {...post} />
        {post.body && (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-800">
            <MessageText text={post.body} names={names} />
          </p>
        )}
        {post.follow_up_at && (
          <div
            className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold ${
              post.follow_up_done_at ? 'bg-neutral-100 text-neutral-500' : followDue ? 'bg-status-warn/10 text-status-warn' : 'bg-brand-50 text-brand-600'
            }`}
          >
            <CalendarClock className="h-4 w-4 shrink-0" aria-hidden />
            <span className="flex-1">
              {post.follow_up_done_at ? 'Follow-up done' : followDue ? 'Follow-up due' : 'Follow up'} · {formatFollowUpAt(post.follow_up_at)}
            </span>
            {post.author_id === meId && (
              <button type="button" disabled={busy} onClick={toggleDone} className="flex items-center gap-1 underline-offset-2 tap-target hover:underline disabled:opacity-50">
                <Check className="h-3.5 w-3.5" aria-hidden /> {post.follow_up_done_at ? 'Undo' : 'Mark done'}
              </button>
            )}
          </div>
        )}
        {post.notified.length > 0 && (
          <p className="flex items-center gap-1.5 text-xs text-neutral-500">
            <AtSign className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Notified {post.notified.map((n) => n.name ?? 'someone').join(', ')}
          </p>
        )}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <ReactionBar counts={post.reaction_counts} mine={post.my_reactions} onToggle={(k) => react(k)} compact={!pickerOpen} />
        </div>
        <button
          type="button"
          aria-expanded={pickerOpen}
          aria-label={pickerOpen ? 'Hide reactions' : 'Add a reaction'}
          onClick={() => setPickerOpen((o) => !o)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-neutral-200 text-neutral-500 tap-target"
        >
          <SmilePlus className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => {
            setComposerOpen(true)
            setReplyTo(null)
          }}
          className="flex h-8 shrink-0 items-center gap-1 rounded-full px-2.5 text-xs font-semibold text-neutral-600 tap-target"
        >
          <MessageCircle className="h-4 w-4" aria-hidden /> Reply
        </button>
      </div>

      {(replies.length > 0 || composerOpen) && (
        <div className="mt-3 space-y-3 border-t border-neutral-100 pt-3">
          {hidden > 0 && (
            <button type="button" onClick={() => setExpanded(true)} className="text-xs font-semibold text-brand-600 tap-target">
              View {hidden} earlier {hidden === 1 ? 'reply' : 'replies'}
            </button>
          )}
          {shown.map((r) => (
            <div key={r.id} className={`flex gap-2.5 ${r.mentions_me ? '-mx-2 rounded-xl bg-brand-50 px-2 py-1.5' : ''}`}>
              <Initials name={r.author_name} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  <span className="font-bold text-neutral-900">{r.author_name ?? 'Someone'}</span>{' '}
                  <span className="text-xs text-neutral-400">{timeAgo(r.created_at)}</span>
                </p>
                {r.reply_to_name && <p className="text-[11px] text-neutral-400">Replying to {r.reply_to_name}</p>}
                <p className="whitespace-pre-wrap text-sm text-neutral-800">
                  <MessageText text={r.body} names={names} />
                </p>
                {r.mentions_me && <p className="mt-0.5 text-[11px] font-semibold text-brand-600">You were mentioned here</p>}
                <div className="mt-1 flex items-center gap-3">
                  <button
                    type="button"
                    aria-pressed={r.my_reactions.includes('like')}
                    onClick={() => react('like', r.id)}
                    className={`text-xs font-semibold tap-target ${r.my_reactions.includes('like') ? 'text-brand-600' : 'text-neutral-500'}`}
                  >
                    Like{r.reaction_counts.like ? ` · ${r.reaction_counts.like}` : ''}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setComposerOpen(true)
                      setReplyTo({ id: r.id, name: r.author_name ?? 'reply' })
                    }}
                    className="text-xs font-semibold text-neutral-500 tap-target"
                  >
                    Reply
                  </button>
                </div>
              </div>
            </div>
          ))}
          {composerOpen && (
            <ReplyComposer
              postId={post.id}
              colleagues={colleagues}
              meId={meId}
              replyTo={replyTo}
              onCancelReplyTo={() => setReplyTo(null)}
              onSent={() => {
                setReplyTo(null)
                setExpanded(true)
                onChanged()
              }}
            />
          )}
        </div>
      )}
    </article>
  )
}
