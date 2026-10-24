/**
 * Which money fields the check-out form asks for, keyed off the chosen
 * order/payment option labels. Labels are admin-editable, so this matches
 * loosely: an order status that reads "Ordered" (not "Will order later")
 * asks for the order value; any payment status mentioning "paid"
 * ("Paid in full", "Part paid") asks for the amount collected.
 */
export function outcomeFields(orderLabel: string | null | undefined, paymentLabel: string | null | undefined) {
  const order = (orderLabel ?? '').trim().toLowerCase()
  const payment = (paymentLabel ?? '').trim().toLowerCase()
  return {
    showOrderAmount: order.startsWith('ordered'),
    showCollected: /\bpaid\b/.test(payment),
  }
}

/** Parses a typed USD amount ("1,250.5", "$300") -- null when blank or not a non-negative number. Rounded to cents. */
export function parseAmount(text: string): number | null {
  const cleaned = text.replace(/[$,\s]/g, '')
  if (!cleaned) return null
  const n = Number(cleaned)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n * 100) / 100
}

/** "$1,250" / "$1,250.50" -- whole dollars drop the cents. */
export function formatUsd(amount: number): string {
  const whole = Number.isInteger(amount)
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`
}
