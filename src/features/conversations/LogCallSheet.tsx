import { useEffect, useMemo, useState } from 'react'
import { Check, ChevronDown, PhoneIncoming, PhoneOutgoing } from 'lucide-react'
import { BottomSheet } from '@/components/BottomSheet'
import { Switch } from '@/components/Switch'
import { haptic } from '@/lib/haptic'
import {
  PURPOSES,
  SEVERITY_DOT,
  findMentions,
  outcomeChips,
  splitOutcomeGroups,
  suggestedNotify,
  toggleOutcome,
  type CallDirection,
  type CallPurpose,
  type ConversationKind,
  type OutcomeGroup,
  type Outcomes,
} from './conversationMeta'
import { conversationErrorMessage, conversationsService } from './conversationsService'
import { FOLLOW_PRESETS, FOLLOW_TIMES, formatFollowDate, followUpIso, presetDate, todayYmd, type FollowPreset } from './followUp'
import { colleagueName, useColleagues } from './useColleagues'

const chip = (on: boolean) =>
  `flex min-h-[36px] items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold tap-target ${
    on ? 'border-neutral-900 bg-white text-neutral-900 dark:border-neutral-100' : 'border-neutral-200 bg-white text-neutral-500'
  }`

/**
 * Log a call (direction, purposes, outcomes) or a note on a customer, with
 * an optional follow-up reminder and people to notify. Outcome groups that
 * match the picked purposes are suggested; the rest sit under "More outcomes".
 */
export function LogCallSheet({
  open,
  onClose,
  kind,
  customerId,
  customerName,
  customerOwnerId,
  meId,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  kind: ConversationKind
  customerId: string
  customerName: string
  customerOwnerId: string | null
  meId: string | null
  onSaved: () => void
}) {
  const colleagues = useColleagues()
  const [direction, setDirection] = useState<CallDirection>('outgoing')
  const [purposes, setPurposes] = useState<CallPurpose[]>([])
  const [outcomes, setOutcomes] = useState<Outcomes>({})
  const [showMore, setShowMore] = useState(false)
  const [body, setBody] = useState('')
  const [followOn, setFollowOn] = useState(false)
  const [preset, setPreset] = useState<FollowPreset>('tomorrow')
  const [picked, setPicked] = useState<string | null>(null)
  const [time, setTime] = useState<string>(FOLLOW_TIMES[0])
  const [notifyOverrides, setNotifyOverrides] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setDirection('outgoing')
    setPurposes([])
    setOutcomes({})
    setShowMore(false)
    setBody('')
    setFollowOn(false)
    setPreset('tomorrow')
    setPicked(null)
    setTime(FOLLOW_TIMES[0])
    setNotifyOverrides({})
    setError(null)
  }, [open, kind])

  const isCall = kind === 'call'
  const { suggested, more } = splitOutcomeGroups(purposes)
  const suggestedIds = useMemo(
    () => suggestedNotify({ purposes, outcomes, colleagues, meId, customerOwnerId }),
    [purposes, outcomes, colleagues, meId, customerOwnerId]
  )
  const notifyIds = [...new Set([...suggestedIds, ...Object.keys(notifyOverrides)])].filter((id) => notifyOverrides[id] ?? suggestedIds.includes(id))
  const chipIds = [...new Set([...suggestedIds, ...Object.keys(notifyOverrides)])]
  const byId = new Map(colleagues.map((c) => [c.id, c]))
  const addable = colleagues.filter((c) => c.id !== meId && !chipIds.includes(c.id))

  const followDate = presetDate(preset, new Date(), picked)
  const followText = followOn ? `Reminder to you on ${formatFollowDate(followDate)}, ${time}` : null

  const canSave = isCall ? purposes.length > 0 : body.trim().length > 0

  async function save() {
    if (!canSave || saving) return
    setSaving(true)
    setError(null)
    try {
      await conversationsService.logPost({
        customerId,
        kind,
        direction: isCall ? direction : null,
        purposes: isCall ? purposes : [],
        body,
        outcomes: isCall ? outcomes : {},
        followUpAt: followOn ? followUpIso(followDate, time) : null,
        notify: notifyIds,
        mentions: findMentions(body, colleagues, colleagueName),
      })
      haptic('success')
      onSaved()
      onClose()
    } catch (e) {
      setError(conversationErrorMessage(e, 'Couldn’t save. Check your connection and try again.'))
    } finally {
      setSaving(false)
    }
  }

  function outcomeRow(group: OutcomeGroup, isSuggested: boolean) {
    return (
      <div key={group.key} className="space-y-2">
        <p className="text-[13px] font-bold text-neutral-700">
          {group.label}
          {isSuggested && <span className="ml-1.5 text-[11px] font-semibold text-brand-600">suggested</span>}
        </p>
        <div role="radiogroup" aria-label={group.label} className="flex flex-wrap gap-1.5">
          {group.options.map((opt) => {
            const on = outcomes[group.key] === opt
            const dot = outcomeChips({ [group.column]: opt })[0]?.severity ?? 'neutral'
            return (
              <button key={opt} type="button" role="radio" aria-checked={on} onClick={() => setOutcomes((o) => toggleOutcome(o, group.key, opt))} className={chip(on)}>
                <span className={`h-2 w-2 rounded-full ${SEVERITY_DOT[dot]}`} aria-hidden />
                {opt}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={isCall ? `Log a call · ${customerName}` : `Add a note · ${customerName}`}>
      <div className="space-y-5 px-5 pb-4 pt-4">
        {isCall && (
          <>
            <div role="radiogroup" aria-label="Direction" className="grid grid-cols-2 gap-1 rounded-xl bg-neutral-100 p-1">
              {(
                [
                  ['outgoing', 'Outgoing', PhoneOutgoing],
                  ['incoming', 'Incoming', PhoneIncoming],
                ] as const
              ).map(([key, label, Icon]) => (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={direction === key}
                  onClick={() => setDirection(key)}
                  className={`flex h-10 items-center justify-center gap-1.5 rounded-lg text-sm font-semibold ${
                    direction === key ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500'
                  }`}
                >
                  <Icon className="h-4 w-4" aria-hidden /> {label}
                </button>
              ))}
            </div>
            <p className="-mt-3 text-xs text-neutral-500">
              {direction === 'incoming' ? 'The customer called the office or you.' : 'You called the customer.'}
            </p>

            <section className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Purpose · pick one or more</p>
              <div className="flex flex-wrap gap-1.5">
                {PURPOSES.map((p) => {
                  const on = purposes.includes(p.key)
                  return (
                    <button
                      key={p.key}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setPurposes((ps) => (on ? ps.filter((x) => x !== p.key) : [...ps, p.key]))}
                      className={chip(on)}
                    >
                      {on && <Check className="h-3.5 w-3.5" aria-hidden />}
                      {p.label}
                    </button>
                  )
                })}
              </div>
            </section>

            <section className="space-y-3 rounded-2xl border border-neutral-200 p-3.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Outcome</p>
              {suggested.length === 0 && <p className="text-sm text-neutral-500">Pick a purpose to see the matching outcome.</p>}
              {suggested.map((g) => outcomeRow(g, true))}
              {more.length > 0 && (
                <button type="button" aria-expanded={showMore} onClick={() => setShowMore((s) => !s)} className="flex items-center gap-1 text-[13px] font-semibold text-brand-600 tap-target">
                  <ChevronDown className={`h-4 w-4 transition-transform ${showMore ? 'rotate-180' : ''}`} aria-hidden />
                  More outcomes ({more.map((g) => g.short).join(', ')})
                </button>
              )}
              {showMore && more.map((g) => outcomeRow(g, false))}
            </section>
          </>
        )}

        <section className="space-y-2">
          <label htmlFor="conv-note" className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
            {isCall ? 'Note of the conversation' : 'Note'}
          </label>
          <textarea
            id="conv-note"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            maxLength={4000}
            placeholder={isCall ? 'What did you agree? Use @ to mention someone.' : 'Write a note… use @ to mention someone.'}
            className="w-full resize-none rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-sm text-neutral-900 outline-none focus:border-brand-500"
          />
        </section>

        <section className="space-y-3 rounded-2xl border border-neutral-200 p-3.5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-neutral-900">Follow up</p>
              <p className="text-xs text-neutral-500">{followText ?? 'Get a reminder to call back.'}</p>
            </div>
            <Switch checked={followOn} onChange={setFollowOn} label="Follow up" />
          </div>
          {followOn && (
            <>
              <div role="radiogroup" aria-label="Follow-up date" className="flex flex-wrap gap-1.5">
                {FOLLOW_PRESETS.map((p) => {
                  const on = preset === p.key
                  const sub = p.key === 'pick' ? (picked ? formatFollowDate(picked) : null) : formatFollowDate(presetDate(p.key))
                  return (
                    <button key={p.key} type="button" role="radio" aria-checked={on} onClick={() => setPreset(p.key)} className={chip(on)}>
                      {p.label}
                      {sub && <span className="text-xs font-medium text-neutral-400">{sub}</span>}
                    </button>
                  )
                })}
              </div>
              {preset === 'pick' && (
                <input
                  type="date"
                  aria-label="Follow-up date"
                  min={todayYmd()}
                  value={picked ?? followDate}
                  onChange={(e) => setPicked(e.target.value || null)}
                  className="h-11 w-full rounded-xl border border-neutral-200 bg-white px-3 text-sm text-neutral-900"
                />
              )}
              <div role="radiogroup" aria-label="Follow-up time" className="flex gap-1.5">
                {FOLLOW_TIMES.map((t) => (
                  <button key={t} type="button" role="radio" aria-checked={time === t} onClick={() => setTime(t)} className={chip(time === t)}>
                    {t}
                  </button>
                ))}
              </div>
            </>
          )}
        </section>

        <section className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Notify</p>
          <div className="flex flex-wrap gap-1.5">
            {chipIds.map((id) => {
              const c = byId.get(id)
              if (!c) return null
              const on = notifyIds.includes(id)
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setNotifyOverrides((o) => ({ ...o, [id]: !on }))}
                  className={chip(on)}
                >
                  {on && <Check className="h-3.5 w-3.5" aria-hidden />}
                  {colleagueName(c)}
                  {c.role_name && <span className="text-xs font-medium text-neutral-400">{c.role_name}</span>}
                </button>
              )
            })}
            {addable.length > 0 && (
              <select
                aria-label="Notify someone else"
                value=""
                onChange={(e) => e.target.value && setNotifyOverrides((o) => ({ ...o, [e.target.value]: true }))}
                className="h-9 rounded-full border border-dashed border-neutral-300 bg-white px-3 text-[13px] font-semibold text-neutral-500"
              >
                <option value="">+ Add someone</option>
                {addable.map((c) => (
                  <option key={c.id} value={c.id}>
                    {colleagueName(c)}
                    {c.role_name ? ` · ${c.role_name}` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>
          <p className="text-xs text-neutral-500">Suggested from purpose and outcome: collections notify Accounting; delayed or denied payment and conflicts also notify the Sale Manager.</p>
        </section>

        {error && <p className="rounded-lg bg-status-danger/10 px-3 py-2 text-sm text-status-danger">{error}</p>}
      </div>
      <div className="sticky bottom-0 border-t border-neutral-100 bg-white px-5 py-3">
        <button
          type="button"
          onClick={save}
          disabled={!canSave || saving}
          className="h-12 w-full rounded-2xl bg-brand-500 text-[15px] font-bold text-white tap-target disabled:opacity-40"
        >
          {saving ? 'Saving…' : isCall ? (purposes.length ? 'Save call' : 'Pick a purpose to save') : 'Save note'}
        </button>
      </div>
    </BottomSheet>
  )
}
