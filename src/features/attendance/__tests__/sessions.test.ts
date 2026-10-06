import { describe, expect, it } from 'vitest'
import { firstClockIn, lastClockOut, workedMs } from '../sessions'

const at = (hm: string) => `2026-10-06T${hm}:00.000Z`
const morning = { clock_in_at: at('01:00'), clock_out_at: at('05:00') }
const afternoon = { clock_in_at: at('06:00'), clock_out_at: at('10:00') }

describe('clock sessions', () => {
  it('starts the day at the first clock-in, whatever the order', () => {
    expect(firstClockIn([afternoon, morning])).toBe(at('01:00'))
    expect(firstClockIn([])).toBeNull()
  })

  it('ends the day at the last clock-out, but only once nothing is open', () => {
    expect(lastClockOut([afternoon, morning])).toBe(at('10:00'))
    expect(lastClockOut([morning, { clock_in_at: at('06:00'), clock_out_at: null }])).toBeNull()
    expect(lastClockOut([])).toBeNull()
  })

  it('adds up time on the clock and leaves out the break between sessions', () => {
    expect(workedMs([morning, afternoon])).toBe(8 * 3600e3)
    expect(workedMs([morning, { clock_in_at: at('06:00'), clock_out_at: null }], Date.parse(at('07:30')))).toBe(5.5 * 3600e3)
  })
})
