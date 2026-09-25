import { useEffect, useState } from 'react'
import { Check, Loader2, Plus } from 'lucide-react'
import { SegmentedControl } from '@/components/SegmentedControl'
import { planService } from '@/features/plan/planService'
import { todayDateString } from '@/lib/dateRange'
import { tierCadenceLabel } from './coverage'
import { coverageService, type Tier } from './coverageService'

/**
 * Customer detail: the visit-cadence tier (A weekly / B fortnightly /
 * C monthly -- no stored tier means B) and a one-tap "add to today's plan".
 * Whether you may change the tier is the customer_tiers RLS's call; a
 * refused save just rolls back and says so.
 */
export function TierCard({ customerId }: { customerId: string }) {
  const [tier, setTier] = useState<Tier>('B')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [planState, setPlanState] = useState<'idle' | 'adding' | 'added'>('idle')

  useEffect(() => {
    let cancelled = false
    coverageService
      .getTier(customerId)
      .then((t) => !cancelled && setTier(t ?? 'B'))
      .catch(() => {
        // Falls back to the default B.
      })
    planService
      .list(todayDateString())
      .then((items) => !cancelled && items.some((i) => i.customer_id === customerId) && setPlanState('added'))
      .catch(() => {
        // Just means the button starts as "Add".
      })
    return () => {
      cancelled = true
    }
  }, [customerId])

  async function handleTier(next: Tier) {
    const prev = tier
    setTier(next)
    setSaving(true)
    setMessage(null)
    try {
      await coverageService.setTier(customerId, next)
    } catch {
      setTier(prev)
      setMessage("You can't change this customer's tier.")
    } finally {
      setSaving(false)
    }
  }

  async function handlePlan() {
    setPlanState('adding')
    try {
      await planService.add(todayDateString(), customerId)
      setPlanState('added')
    } catch {
      setPlanState('idle')
      setMessage('Could not add to today’s plan.')
    }
  }

  return (
    <div className="mt-4 rounded-xl2 bg-white p-4 shadow-card">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-neutral-900">Visit tier</p>
          <p className="text-xs text-neutral-500">
            {tierCadenceLabel(tier)}
            {saving && <Loader2 className="ml-1 inline h-3 w-3 animate-spin" aria-label="Saving" />}
          </p>
        </div>
        <SegmentedControl<Tier>
          ariaLabel="Visit tier"
          shape="tabs"
          value={tier}
          onChange={(t) => void handleTier(t)}
          className="w-[150px] shrink-0"
          options={[
            { value: 'A', label: 'A' },
            { value: 'B', label: 'B' },
            { value: 'C', label: 'C' },
          ]}
        />
      </div>
      <button
        onClick={handlePlan}
        disabled={planState !== 'idle'}
        className={`mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-bold tap-target ${
          planState === 'added' ? 'bg-status-working/10 text-status-working' : 'border border-neutral-200 text-brand-600'
        }`}
      >
        {planState === 'adding' ? <Loader2 className="h-4 w-4 animate-spin" /> : planState === 'added' ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
        {planState === 'added' ? "On today's plan" : "Add to today's plan"}
      </button>
      {message && <p className="mt-2 text-xs text-status-danger">{message}</p>}
    </div>
  )
}
