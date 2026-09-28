import { useMemo, useRef, useState } from 'react'
import { SendHorizontal, X } from 'lucide-react'
import { findMentions, type Colleague } from './conversationMeta'
import { conversationErrorMessage, conversationsService } from './conversationsService'
import { colleagueName } from './useColleagues'

/** The "@partial" being typed at the caret, if any. */
function mentionQuery(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret)
  const at = before.lastIndexOf('@')
  if (at === -1) return null
  if (at > 0 && /[\p{L}\p{N}]/u.test(before[at - 1])) return null
  const query = before.slice(at + 1)
  if (query.length > 24 || /\n/.test(query) || /\s{2}/.test(query)) return null
  return { start: at, query }
}

/**
 * Reply box for a conversation: "@" opens a colleague picker, the chosen
 * names are resolved to user ids on send (so the server can notify them),
 * and an optional "Replying to …" target can be cancelled.
 */
export function ReplyComposer({
  postId,
  colleagues,
  meId,
  replyTo,
  onCancelReplyTo,
  onSent,
  autoFocus,
}: {
  postId: string
  colleagues: Colleague[]
  meId: string | null
  replyTo: { id: string; name: string } | null
  onCancelReplyTo: () => void
  onSent: () => void
  autoFocus?: boolean
}) {
  const [text, setText] = useState('')
  const [caret, setCaret] = useState(0)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLTextAreaElement>(null)

  const others = useMemo(() => colleagues.filter((c) => c.id !== meId), [colleagues, meId])
  const q = mentionQuery(text, caret)
  const suggestions = q
    ? others.filter((c) => colleagueName(c).toLowerCase().includes(q.query.toLowerCase()) || c.full_name.toLowerCase().includes(q.query.toLowerCase())).slice(0, 5)
    : []

  function pick(c: Colleague) {
    if (!q) return
    const name = colleagueName(c)
    const next = text.slice(0, q.start) + '@' + name + ' ' + text.slice(caret)
    const pos = q.start + name.length + 2
    setText(next)
    setCaret(pos)
    requestAnimationFrame(() => {
      ref.current?.focus()
      ref.current?.setSelectionRange(pos, pos)
    })
  }

  async function send() {
    const body = text.trim()
    if (!body || sending) return
    setSending(true)
    setError(null)
    try {
      await conversationsService.reply(postId, body, replyTo?.id ?? null, findMentions(body, others, colleagueName))
      setText('')
      onSent()
    } catch (e) {
      setError(conversationErrorMessage(e, 'Couldn’t send your reply.'))
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="relative space-y-1.5">
      {replyTo && (
        <p className="flex items-center gap-2 text-xs text-neutral-500">
          Replying to <span className="font-semibold text-neutral-700">{replyTo.name}</span>
          <button type="button" onClick={onCancelReplyTo} className="flex items-center gap-0.5 font-semibold text-brand-600 tap-target">
            <X className="h-3 w-3" aria-hidden /> Cancel
          </button>
        </p>
      )}
      {suggestions.length > 0 && (
        <ul role="listbox" aria-label="Mention someone" className="absolute bottom-full left-0 right-12 z-10 mb-1 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-card">
          {suggestions.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                role="option"
                aria-selected={false}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(c)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-neutral-50"
              >
                <span className="font-semibold text-neutral-800">{colleagueName(c)}</span>
                <span className="text-xs text-neutral-400">{c.role_name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-end gap-2">
        <textarea
          ref={ref}
          value={text}
          autoFocus={autoFocus}
          rows={1}
          placeholder="Write a reply… use @ to mention"
          aria-label="Reply"
          onChange={(e) => {
            setText(e.target.value)
            setCaret(e.target.selectionStart ?? e.target.value.length)
          }}
          onSelect={(e) => setCaret(e.currentTarget.selectionStart ?? 0)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && suggestions.length === 0) {
              e.preventDefault()
              send()
            }
          }}
          className="max-h-32 min-h-[40px] flex-1 resize-none rounded-2xl border border-neutral-200 bg-white px-3.5 py-2 text-sm text-neutral-900 outline-none focus:border-brand-500"
        />
        <button
          type="button"
          onClick={send}
          disabled={!text.trim() || sending}
          aria-label="Send reply"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-500 text-white tap-target disabled:opacity-40"
        >
          <SendHorizontal className="h-4 w-4" aria-hidden />
        </button>
      </div>
      {error && <p className="text-xs text-status-danger">{error}</p>}
    </div>
  )
}
