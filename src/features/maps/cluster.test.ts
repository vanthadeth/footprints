import { describe, expect, it } from 'vitest'
import { groupPoints } from './cluster'

const pt = (x: number, y: number, item = `${x},${y}`) => ({ x, y, item })

describe('groupPoints', () => {
  it('returns nothing for no points', () => {
    expect(groupPoints([], 200)).toEqual([])
  })

  it('keeps far-apart points as their own groups', () => {
    const groups = groupPoints([pt(10, 10), pt(500, 500)], 200)
    expect(groups).toHaveLength(2)
    expect(groups.every((g) => g.items.length === 1)).toBe(true)
  })

  it('merges points in the same cell and centres the group on them', () => {
    const [g] = groupPoints([pt(10, 10), pt(20, 30)], 200)
    expect(g.items).toEqual(['10,10', '20,30'])
    expect(g.x).toBe(15)
    expect(g.y).toBe(20)
  })

  it('never returns more groups than the limit, and keeps every point', () => {
    const points = Array.from({ length: 2000 }, (_, i) => pt((i * 37) % 1900, (i * 53) % 1300, String(i)))
    for (const max of [1, 10, 200]) {
      const groups = groupPoints(points, max)
      expect(groups.length).toBeLessThanOrEqual(max)
      expect(groups.reduce((n, g) => n + g.items.length, 0)).toBe(2000)
    }
  })

  it('leaves no two groups overlapping on screen', () => {
    const points = Array.from({ length: 500 }, (_, i) => pt((i * 37) % 700, (i * 53) % 500, String(i)))
    const groups = groupPoints(points, 200)
    for (const a of groups) for (const b of groups) if (a !== b) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(30)
  })
})
