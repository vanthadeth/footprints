import { describe, expect, it } from 'vitest'
import { acceptMoneyText, moneyText, parseMoney } from '../moneyInput'

describe('money input', () => {
  it('lets digits with up to 2 decimals stand while typing', () => {
    for (const t of ['', '12', '12.', '12.5', '12.50', '.5', '0.12']) expect(acceptMoneyText(t)).toBe(true)
    for (const t of ['12.505', '1e3', '-1', 'abc', '1.2.3', '1,000', '1234567']) expect(acceptMoneyText(t)).toBe(false)
  })

  it('parses to cents, and to nothing until there is a digit', () => {
    expect(parseMoney('12.5')).toBe(12.5)
    expect(parseMoney('.5')).toBe(0.5)
    expect(parseMoney('12.')).toBe(12)
    expect(parseMoney('')).toBeNull()
    expect(parseMoney('.')).toBeNull()
    expect(parseMoney('12.505')).toBeNull()
  })

  it('shows 2 decimals once the field loses focus', () => {
    expect(moneyText(12.5)).toBe('12.50')
    expect(moneyText(10)).toBe('10.00')
    expect(moneyText(0.1)).toBe('0.10')
    expect(moneyText(0.125)).toBe('0.13')
  })
})
