import { describe, expect, it } from 'vitest'
import { formatUsd, outcomeFields, parseAmount } from '../visitOutcome'

describe('outcomeFields', () => {
  it('asks for the order value only when the customer ordered', () => {
    expect(outcomeFields('Ordered', null).showOrderAmount).toBe(true)
    expect(outcomeFields('Will order later', null).showOrderAmount).toBe(false)
    expect(outcomeFields('No order', null).showOrderAmount).toBe(false)
    expect(outcomeFields(null, null).showOrderAmount).toBe(false)
  })

  it('asks for the amount collected when something was paid', () => {
    expect(outcomeFields(null, 'Paid in full').showCollected).toBe(true)
    expect(outcomeFields(null, 'Part paid').showCollected).toBe(true)
    expect(outcomeFields(null, 'Nothing collected').showCollected).toBe(false)
    expect(outcomeFields(null, 'Not due').showCollected).toBe(false)
  })
})

describe('parseAmount', () => {
  it('accepts plain, comma-separated and dollar-prefixed amounts', () => {
    expect(parseAmount('300')).toBe(300)
    expect(parseAmount('1,250.5')).toBe(1250.5)
    expect(parseAmount(' $42.129 ')).toBe(42.13)
  })

  it('returns null for blank, negative or non-numeric input', () => {
    expect(parseAmount('')).toBeNull()
    expect(parseAmount('-5')).toBeNull()
    expect(parseAmount('abc')).toBeNull()
  })
})

describe('formatUsd', () => {
  it('drops cents for whole dollars', () => {
    expect(formatUsd(1250)).toBe('$1,250')
    expect(formatUsd(12.5)).toBe('$12.50')
  })
})
