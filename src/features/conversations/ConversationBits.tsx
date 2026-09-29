import { Fragment } from 'react'
import { PhoneIncoming, PhoneOutgoing, StickyNote } from 'lucide-react'
import { PURPOSE_BY_KEY, REACTIONS, SEVERITY_DOT, outcomeChips, type CallDirection, type CallPurpose, type ConversationKind, type ReactionKey } from './conversationMeta'

/** Initials avatar -- conversations don't load photos for every author. */
export function Initials({ name, size = 'md' }: { name: string | null; size?: 'sm' | 'md' }) {
  const letters =
    (name ?? '?')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join('') || '?'
  const dim = size === 'sm' ? 'h-7 w-7 text-[11px]' : 'h-9 w-9 text-xs'
  return <span className={`flex ${dim} shrink-0 items-center justify-center rounded-full bg-brand-50 font-bold text-brand-600`}>{letters}</span>
}

export function PurposeTags({ purposes }: { purposes: CallPurpose[] }) {
  if (purposes.length === 0) return null
  return (
    <span className="flex flex-wrap gap-1">
      {purposes.map((p) => (
        <span key={p} className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${PURPOSE_BY_KEY[p]?.tone ?? ''}`}>
          {PURPOSE_BY_KEY[p]?.label ?? p}
        </span>
      ))}
    </span>
  )
}

export function OutcomeChips(props: {
  outcome_payment: string | null
  outcome_order: string | null
  outcome_delivery: string | null
  outcome_conflict: string | null
}) {
  const chips = outcomeChips(props)
  if (chips.length === 0) return null
  return (
    <span className="flex flex-wrap gap-1.5">
      {chips.map((c) => (
        <span key={c.group} className="flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-2 py-1 text-xs font-semibold text-neutral-700">
          <span className={`h-2 w-2 rounded-full ${SEVERITY_DOT[c.severity]}`} aria-hidden />
          {c.label}
        </span>
      ))}
    </span>
  )
}

export function KindIcon({ kind, direction }: { kind: ConversationKind; direction: CallDirection | null }) {
  const Icon = kind === 'note' ? StickyNote : direction === 'incoming' ? PhoneIncoming : PhoneOutgoing
  return <Icon className="h-3.5 w-3.5" aria-hidden />
}

/** Message text with @Name mentions picked out in the link colour. */
export function MessageText({ text, names }: { text: string; names: string[] }) {
  if (!text) return null
  const sorted = [...names].filter(Boolean).sort((a, b) => b.length - a.length)
  if (sorted.length === 0) return <>{text}</>
  const escaped = sorted.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const parts = text.split(new RegExp(`(@(?:${escaped.join('|')}))`, 'gi'))
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <span key={i} className="font-semibold text-brand-600">
            {part}
          </span>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        )
      )}
    </>
  )
}

/** Reaction pills with counts; tapping toggles the viewer's own reaction. */
export function ReactionBar({
  counts,
  mine,
  onToggle,
  compact,
}: {
  counts: Partial<Record<ReactionKey, number>>
  mine: ReactionKey[]
  onToggle: (key: ReactionKey) => void
  compact?: boolean
}) {
  return (
    <span className="flex flex-wrap gap-1.5">
      {REACTIONS.map((r) => {
        const n = counts[r.key] ?? 0
        const on = mine.includes(r.key)
        if (compact && n === 0 && !on) return null
        return (
          <button
            key={r.key}
            type="button"
            aria-pressed={on}
            aria-label={`${r.label}${n ? `, ${n}` : ''}`}
            onClick={() => onToggle(r.key)}
            className={`flex h-8 items-center gap-1 rounded-full border px-2.5 text-xs font-semibold tap-target ${
              on ? 'border-brand-500 bg-brand-50 text-brand-600' : 'border-neutral-200 bg-white text-neutral-600'
            }`}
          >
            <span aria-hidden>{r.emoji}</span>
            {compact ? null : <span>{r.label}</span>}
            {n > 0 && <span className="font-bold">{n}</span>}
          </button>
        )
      })}
    </span>
  )
}
