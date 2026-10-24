import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { axisPercent, buildStrip, gapKind, hm, segmentTitle, visitKind, type StripDay } from '../dayStrip'
import { DayStrip } from '../DayStrip'

const day = (over: Partial<StripDay> = {}): StripDay => ({
  shiftStart: hm('08:00'),
  shiftEnd: hm('17:00'),
  clockIn: hm('08:00'),
  clockOut: hm('17:00'),
  visits: [],
  ...over,
})

describe('visitKind / gapKind', () => {
  it('classifies visits by length', () => {
    expect(visitKind(4)).toBe('short')
    expect(visitKind(5)).toBe('good')
    expect(visitKind(45)).toBe('good')
    expect(visitKind(46)).toBe('long')
  })
  it('classifies gaps as travel up to 30 min, then idle', () => {
    expect(gapKind(30)).toBe('travel')
    expect(gapKind(31)).toBe('idle')
  })
})

describe('buildStrip', () => {
  it('marks time before clock-in and after clock-out within the shift as missed', () => {
    const segs = buildStrip(day({ clockIn: hm('09:00'), clockOut: hm('16:00') }), hm('07:00'), hm('19:00'))
    expect(segs.map((s) => s.kind)).toEqual(['missed', 'idle', 'missed'])
  })
  it('puts visits and the gaps between them in order', () => {
    const segs = buildStrip(
      day({ visits: [{ start: hm('08:10'), end: hm('08:14') }, { start: hm('08:40'), end: hm('09:25'), flagged: true }] }),
      hm('07:00'),
      hm('19:00'),
    )
    expect(segs.map((s) => s.kind)).toEqual(['travel', 'short', 'travel', 'good', 'idle'])
    expect(segs[3].flagged).toBe(true)
  })
  it('keeps a short gap outside working hours as travel, not missed', () => {
    const segs = buildStrip(day({ clockIn: hm('07:45'), visits: [{ start: hm('08:00'), end: hm('09:00') }], clockOut: hm('17:20') }), hm('07:00'), hm('19:00'))
    expect(segs.map((s) => s.kind)).toEqual(['travel', 'long', 'idle'])
  })
  it('places segments as percentages of the axis', () => {
    const [seg] = buildStrip(day({ visits: [{ start: hm('08:00'), end: hm('09:00') }], clockOut: hm('09:00') }), hm('07:00'), hm('19:00'))
    expect(seg.left).toBeCloseTo(100 / 12)
    expect(seg.width).toBeCloseTo(100 / 12)
  })
  it('clips to the axis and returns nothing for an empty axis', () => {
    const segs = buildStrip(day({ clockIn: hm('06:00') }), hm('07:00'), hm('19:00'))
    expect(segs[0].left).toBe(0)
    expect(buildStrip(day(), 600, 600)).toEqual([])
  })
})

describe('axisPercent / segmentTitle', () => {
  it('clamps to the axis', () => {
    expect(axisPercent(hm('06:00'), hm('07:00'), hm('19:00'))).toBe(0)
    expect(axisPercent(hm('20:00'), hm('07:00'), hm('19:00'))).toBe(100)
  })
  it('titles a segment with its kind and length', () => {
    const s = buildStrip(day({ visits: [{ start: hm('08:00'), end: hm('09:05'), flagged: true }], clockOut: hm('09:05') }), 420, 1140)[0]
    expect(segmentTitle(s)).toBe('Long visit · 1h 05m · flagged')
  })
})

describe('<DayStrip>', () => {
  it('renders one block per segment plus the two outside-hours blocks, and shift lines on request', () => {
    const d = day({ visits: [{ start: hm('09:00'), end: hm('10:00') }] })
    const plain = renderToStaticMarkup(<DayStrip day={d} />)
    expect(plain.match(/day-strip-seg/g)?.length).toBe(2 + buildStrip(d, 420, 1140).length)
    expect(plain).not.toContain('day-strip-shift')
    expect(renderToStaticMarkup(<DayStrip day={d} shiftLines />).match(/day-strip-shift/g)?.length).toBe(2)
    expect(renderToStaticMarkup(<DayStrip day={d} thin />)).toContain('h-[15px]')
  })
})
