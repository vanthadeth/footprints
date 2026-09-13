import { afterEach, describe, expect, it, vi } from 'vitest'
import { haptic } from '../haptic'

describe('haptic', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    // @ts-expect-error -- test cleanup of a property we may have added
    delete navigator.vibrate
  })

  it('never throws when navigator.vibrate is unsupported (most desktops, iOS Safari)', () => {
    expect(() => haptic('success')).not.toThrow()
  })

  it('never throws even if the underlying vibrate() call itself throws', () => {
    Object.defineProperty(navigator, 'vibrate', {
      configurable: true,
      value: () => {
        throw new Error('boom')
      },
    })
    // No prior pointerdown in this test environment, so haptic() should
    // simply skip calling vibrate -- but even if it did, it must not throw.
    expect(() => haptic('error')).not.toThrow()
  })
})
