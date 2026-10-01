import { useEffect, useState } from 'react'
import { acceptMoneyText, moneyText, parseMoney } from '@/lib/moneyInput'

/**
 * A typed dollar amount with up to 2 decimals (rates, limits). Keystrokes
 * that would make it anything else are ignored; an empty or over-max field
 * is flagged and reported through onValidChange so the form can hold Save.
 * Same footprint as Stepper, so they line up in a settings row.
 */
export function MoneyInput({
  value,
  onChange,
  label,
  min = 0,
  max,
  onValidChange,
}: {
  value: number
  onChange: (value: number) => void
  /** What the amount is, for the field's accessible name ("Hotel rate"). */
  label: string
  min?: number
  max: number
  onValidChange?: (ok: boolean) => void
}) {
  const [text, setText] = useState(() => moneyText(value))
  const [focused, setFocused] = useState(false)
  const parsed = parseMoney(text)
  const ok = parsed !== null && parsed >= min && parsed <= max

  // Follow the value from outside (rates loading) unless the person is typing.
  useEffect(() => {
    if (!focused && parseMoney(text) !== value) setText(moneyText(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only an outside change of value should rewrite the text
  }, [value])

  useEffect(() => {
    onValidChange?.(ok)
  }, [ok, onValidChange])

  return (
    <span className="flex shrink-0 flex-col items-end gap-1">
      <span
        className={`flex h-10 w-[116px] items-center rounded-lg border-[1.5px] px-2.5 focus-within:border-brand-500 ${
          ok ? 'border-neutral-200 dark:border-neutral-700' : 'border-status-danger focus-within:border-status-danger'
        }`}
      >
        <span className="text-sm font-bold text-neutral-500">$</span>
        <input
          type="text"
          inputMode="decimal"
          autoComplete="off"
          aria-label={label}
          aria-invalid={!ok}
          value={text}
          placeholder="0.00"
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false)
            if (parsed !== null) setText(moneyText(parsed))
          }}
          onChange={(e) => {
            const next = e.target.value.replace(',', '.').trim()
            if (!acceptMoneyText(next)) return
            setText(next)
            const n = parseMoney(next)
            if (n !== null && n >= min && n <= max) onChange(n)
          }}
          className="min-w-0 flex-1 bg-transparent text-right text-sm font-extrabold tabular-nums text-neutral-900 outline-none placeholder:font-normal placeholder:text-neutral-400"
        />
      </span>
      {!ok && <span className="text-[11.5px] font-semibold text-status-danger">{parsed === null ? 'Enter an amount' : `Up to $${moneyText(max)}`}</span>}
    </span>
  )
}
