/** Rules for a typed dollar amount: digits with at most 2 decimals, no sign or exponent. */

const MONEY_TEXT = /^\d{0,6}(\.\d{0,2})?$/

/** Whether `text` may stand in the field while typing ("", "12.", ".5" are fine; "12.505", "-1", "1e3" aren't). */
export function acceptMoneyText(text: string): boolean {
  return MONEY_TEXT.test(text)
}

/** The amount `text` stands for, rounded to cents; null when it isn't a number yet ("" or "."). */
export function parseMoney(text: string): number | null {
  if (!acceptMoneyText(text) || !/\d/.test(text)) return null
  return Math.round(Number(text) * 100) / 100
}

/** The field's text once it loses focus: always 2 decimals (12.5 → "12.50"). */
export function moneyText(value: number): string {
  return (Math.round(value * 100) / 100).toFixed(2)
}
