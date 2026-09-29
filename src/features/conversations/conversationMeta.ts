/**
 * Fixed vocabulary for customer conversations: call purposes, the outcome
 * groups (labels must match the check constraints in migration 0093
 * exactly), reactions, and who to suggest notifying.
 */

export type CallPurpose = 'care' | 'delivery' | 'discount' | 'collection' | 'followup' | 'conflict'
export type CallDirection = 'outgoing' | 'incoming'
export type ConversationKind = 'call' | 'note'
export type ReactionKey = 'like' | 'noted' | 'follow' | 'thanks'
export type OutcomeGroupKey = 'payment' | 'order' | 'delivery' | 'conflict'

export function kindLabel(kind: ConversationKind, direction: CallDirection | null): string {
  if (kind === 'note') return 'Note'
  return direction === 'incoming' ? 'Incoming call' : 'Outgoing call'
}

export interface PurposeMeta {
  key: CallPurpose
  label: string
  /** Chip classes: tint background + readable text, in both themes. */
  tone: string
}

export const PURPOSES: PurposeMeta[] = [
  { key: 'care', label: 'Customer care', tone: 'bg-brand-50 text-brand-600' },
  { key: 'delivery', label: 'Delivery confirmation', tone: 'bg-status-visiting/10 text-status-visiting dark:text-violet-300' },
  { key: 'discount', label: 'Collection discount notice', tone: 'bg-status-working/10 text-status-working dark:text-emerald-300' },
  { key: 'collection', label: 'Collection notice', tone: 'bg-status-warn/10 text-status-warn dark:text-orange-300' },
  { key: 'followup', label: 'Collection follow-up', tone: 'bg-status-warn/10 text-status-warn dark:text-orange-300' },
  { key: 'conflict', label: 'Resolve conflict', tone: 'bg-status-danger/10 text-status-danger dark:text-red-300' },
]

export const PURPOSE_BY_KEY: Record<CallPurpose, PurposeMeta> = Object.fromEntries(PURPOSES.map((p) => [p.key, p])) as Record<CallPurpose, PurposeMeta>

/** Collection-type purposes: these suggest the Payment outcome and notifying Accounting. */
export const COLLECTION_PURPOSES: CallPurpose[] = ['collection', 'discount', 'followup']

export interface OutcomeGroup {
  key: OutcomeGroupKey
  label: string
  /** Short label for chips on a post ("Payment: Delay payment"). */
  short: string
  /** The column this group is stored in on customer_posts. */
  column: 'outcome_payment' | 'outcome_order' | 'outcome_delivery' | 'outcome_conflict'
  /** Purposes that make this group a suggestion. */
  suggestedFor: CallPurpose[]
  options: readonly string[]
}

export const OUTCOME_GROUPS: OutcomeGroup[] = [
  {
    key: 'payment',
    label: 'Payment status',
    short: 'Payment',
    column: 'outcome_payment',
    suggestedFor: COLLECTION_PURPOSES,
    options: ['Paid in full', 'Partially paid', 'Delay payment', 'Denied to pay', 'Notify only'],
  },
  { key: 'order', label: 'Order status', short: 'Order', column: 'outcome_order', suggestedFor: ['care'], options: ['Ordered', 'Will order', 'No order'] },
  {
    key: 'delivery',
    label: 'Delivery status',
    short: 'Delivery',
    column: 'outcome_delivery',
    suggestedFor: ['delivery'],
    options: ['Confirmed', 'Will check', 'Not yet received', 'Lost', 'Dispute'],
  },
  { key: 'conflict', label: 'Conflict status', short: 'Conflict', column: 'outcome_conflict', suggestedFor: ['conflict'], options: ['Critical', 'Moderate', 'Mild', 'Resolved'] },
]

export type Outcomes = Partial<Record<OutcomeGroupKey, string>>

/** Groups matching the picked purposes come first ("suggested"); the rest go under "More outcomes". */
export function splitOutcomeGroups(purposes: CallPurpose[]): { suggested: OutcomeGroup[]; more: OutcomeGroup[] } {
  const suggested = OUTCOME_GROUPS.filter((g) => g.suggestedFor.some((p) => purposes.includes(p)))
  return { suggested, more: OUTCOME_GROUPS.filter((g) => !suggested.includes(g)) }
}

/** Single choice per group; picking the current value again clears it. */
export function toggleOutcome(outcomes: Outcomes, group: OutcomeGroupKey, value: string): Outcomes {
  const next = { ...outcomes }
  if (next[group] === value) delete next[group]
  else next[group] = value
  return next
}

export type Severity = 'good' | 'warn' | 'bad' | 'neutral'

const SEVERITY: Record<string, Severity> = {
  'Paid in full': 'good',
  'Partially paid': 'warn',
  'Delay payment': 'warn',
  'Denied to pay': 'bad',
  'Notify only': 'neutral',
  Ordered: 'good',
  'Will order': 'warn',
  'No order': 'neutral',
  Confirmed: 'good',
  'Will check': 'warn',
  'Not yet received': 'warn',
  Lost: 'bad',
  Dispute: 'bad',
  Critical: 'bad',
  Moderate: 'warn',
  Mild: 'neutral',
  Resolved: 'good',
}

export const SEVERITY_DOT: Record<Severity, string> = {
  good: 'bg-status-working',
  warn: 'bg-status-warn',
  bad: 'bg-status-danger',
  neutral: 'bg-neutral-400',
}

export interface OutcomeChip {
  group: OutcomeGroupKey
  label: string
  value: string
  severity: Severity
}

type OutcomeColumns = Partial<Record<OutcomeGroup['column'], string | null>>

/** The outcomes recorded on a post, in group order, for chips. */
export function outcomeChips(post: OutcomeColumns): OutcomeChip[] {
  return OUTCOME_GROUPS.flatMap((g) => {
    const value = post[g.column]
    return value ? [{ group: g.key, label: `${g.short}: ${value}`, value, severity: SEVERITY[value] ?? 'neutral' }] : []
  })
}

/** RPC arguments for the outcome columns. */
export function outcomeArgs(outcomes: Outcomes) {
  return {
    p_outcome_payment: outcomes.payment ?? null,
    p_outcome_order: outcomes.order ?? null,
    p_outcome_delivery: outcomes.delivery ?? null,
    p_outcome_conflict: outcomes.conflict ?? null,
  }
}

export interface ReactionMeta {
  key: ReactionKey
  label: string
  emoji: string
}

export const REACTIONS: ReactionMeta[] = [
  { key: 'like', label: 'Like', emoji: '👍' },
  { key: 'noted', label: 'Noted', emoji: '✅' },
  { key: 'follow', label: 'Follow up', emoji: '🚩' },
  { key: 'thanks', label: 'Thanks', emoji: '🙏' },
]

export interface Colleague {
  id: string
  full_name: string
  nickname: string | null
  photo_path: string | null
  role_key: string | null
  role_name: string | null
}

/**
 * Who a new call should notify by default:
 * - the customer's own rep, when someone else is logging it;
 * - Accounting for any collection purpose;
 * - the Sale Manager when payment is delayed/denied, or for a conflict (and always for a Critical one).
 */
export function suggestedNotify(opts: {
  purposes: CallPurpose[]
  outcomes: Outcomes
  colleagues: Colleague[]
  meId: string | null
  customerOwnerId: string | null
}): string[] {
  const { purposes, outcomes, colleagues, meId, customerOwnerId } = opts
  const ids = new Set<string>()
  if (customerOwnerId && customerOwnerId !== meId) ids.add(customerOwnerId)
  const byRole = (key: string) => colleagues.filter((c) => c.role_key === key).map((c) => c.id)
  if (purposes.some((p) => COLLECTION_PURPOSES.includes(p))) byRole('accounting').forEach((id) => ids.add(id))
  const payBad = outcomes.payment === 'Delay payment' || outcomes.payment === 'Denied to pay'
  if (payBad || purposes.includes('conflict') || outcomes.conflict === 'Critical') byRole('sales_manager').forEach((id) => ids.add(id))
  if (meId) ids.delete(meId)
  return [...ids]
}

/**
 * The @mentions in a message, resolved against colleagues' display names
 * (longest name first, so "@Sok Dara" wins over "@Sok").
 */
export function findMentions(text: string, colleagues: Colleague[], nameOf: (c: Colleague) => string): string[] {
  const found = new Set<string>()
  const taken: [number, number][] = []
  const lower = text.toLowerCase()
  const sorted = [...colleagues].sort((a, b) => nameOf(b).length - nameOf(a).length)
  for (const c of sorted) {
    const name = nameOf(c).trim().toLowerCase()
    if (!name) continue
    const needle = '@' + name
    let at = lower.indexOf(needle)
    while (at !== -1) {
      const end = at + needle.length
      const after = lower[end]
      const free = !taken.some(([s, e]) => at < e && end > s)
      if (free && (after === undefined || !/[\p{L}\p{N}]/u.test(after))) {
        found.add(c.id)
        taken.push([at, end])
      }
      at = lower.indexOf(needle, at + 1)
    }
  }
  return [...found]
}
