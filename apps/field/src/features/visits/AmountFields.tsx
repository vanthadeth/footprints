import { DollarSign } from 'lucide-react'
import { outcomeFields } from './visitOutcome'

/**
 * Order value / amount collected inputs for the visit record ("order value
 * only" -- no product lines). Each input only appears once the matching
 * status says there's something to record (see outcomeFields).
 */
export function AmountFields({
  orderLabel,
  paymentLabel,
  orderAmount,
  collected,
  onOrderAmount,
  onCollected,
}: {
  orderLabel: string | null | undefined
  paymentLabel: string | null | undefined
  orderAmount: string
  collected: string
  onOrderAmount: (value: string) => void
  onCollected: (value: string) => void
}) {
  const { showOrderAmount, showCollected } = outcomeFields(orderLabel, paymentLabel)
  if (!showOrderAmount && !showCollected) return null
  return (
    <div className="grid grid-cols-2 gap-3">
      {showOrderAmount && <AmountInput id="visit-order-amount" label="Order value" value={orderAmount} onChange={onOrderAmount} />}
      {showCollected && <AmountInput id="visit-collected" label="Collected" value={collected} onChange={onCollected} />}
    </div>
  )
}

function AmountInput({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-xs font-semibold uppercase tracking-wide text-neutral-400">
        {label} (USD)
      </label>
      <div className="relative">
        <DollarSign className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" aria-hidden />
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="0.00"
          className="h-12 w-full rounded-xl2 border border-neutral-200 bg-white pl-9 pr-3 text-base font-semibold text-neutral-900 placeholder:font-normal placeholder:text-neutral-400"
        />
      </div>
    </div>
  )
}
