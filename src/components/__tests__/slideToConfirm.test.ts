import { describe, expect, it } from 'vitest'
import { isSlideConfirmed, slideProgress, SLIDE_CONFIRM_THRESHOLD } from '../slideToConfirm'

describe('slideProgress', () => {
  it('maps drag distance onto the knob travel (track minus knob and padding)', () => {
    // 358 track, 56 knob, 4px padding each side -> 294px of travel
    expect(slideProgress(147, 358, 56)).toBeCloseTo(0.5)
    expect(slideProgress(294, 358, 56)).toBe(1)
  })

  it('clamps to 0-1', () => {
    expect(slideProgress(-40, 358, 56)).toBe(0)
    expect(slideProgress(900, 358, 56)).toBe(1)
  })

  it('returns 0 when the track is too narrow to slide', () => {
    expect(slideProgress(20, 50, 56)).toBe(0)
  })
})

describe('isSlideConfirmed', () => {
  it('only confirms past the threshold', () => {
    expect(isSlideConfirmed(SLIDE_CONFIRM_THRESHOLD - 0.01)).toBe(false)
    expect(isSlideConfirmed(SLIDE_CONFIRM_THRESHOLD)).toBe(true)
    expect(isSlideConfirmed(1)).toBe(true)
  })
})
