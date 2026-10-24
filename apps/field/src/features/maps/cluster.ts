/** The most markers a map draws at once; beyond that nearby pins merge into count bubbles. */
export const MAX_PINS = 200

/** Two markers closer than this (in screen pixels) would overlap, so they merge. */
const MIN_GAP = 52

/** A point already projected to screen pixels at the map's current zoom. */
export interface PixelPoint<T> {
  x: number
  y: number
  item: T
}

export interface PixelGroup<T> {
  /** Centre of the members, in the same pixel space. */
  x: number
  y: number
  items: T[]
}

/**
 * One sweep: the biggest node first takes in every node within `radius`
 * of it, then the next biggest node still free, and so on. A spatial grid
 * keeps it close to linear.
 */
function sweep<T>(nodes: PixelGroup<T>[], radius: number): PixelGroup<T>[] {
  const cell = (n: number) => Math.floor(n / radius)
  const grid = new Map<string, number[]>()
  nodes.forEach((n, i) => {
    const k = `${cell(n.x)}:${cell(n.y)}`
    const list = grid.get(k)
    if (list) list.push(i)
    else grid.set(k, [i])
  })
  const order = nodes.map((_, i) => i).sort((a, b) => nodes[b].items.length - nodes[a].items.length)
  const taken = new Uint8Array(nodes.length)
  const out: PixelGroup<T>[] = []
  const r2 = radius * radius
  for (const i of order) {
    if (taken[i]) continue
    taken[i] = 1
    const seed = nodes[i]
    let sx = seed.x * seed.items.length
    let sy = seed.y * seed.items.length
    const items = [...seed.items]
    const cx = cell(seed.x)
    const cy = cell(seed.y)
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (const j of grid.get(`${cx + dx}:${cy + dy}`) ?? []) {
          if (taken[j]) continue
          const n = nodes[j]
          if ((n.x - seed.x) ** 2 + (n.y - seed.y) ** 2 > r2) continue
          taken[j] = 1
          sx += n.x * n.items.length
          sy += n.y * n.items.length
          items.push(...n.items)
        }
    out.push({ x: sx / items.length, y: sy / items.length, items })
  }
  return out
}

/**
 * Groups points that sit close together on screen. Starts with a `radius`
 * of 60px and widens it until there are at most `max` groups, so the map
 * never draws more than `max` markers however many points there are.
 * Groups whose centres still end up overlapping are merged too.
 */
export function groupPoints<T>(points: PixelPoint<T>[], max: number, radius = 60): PixelGroup<T>[] {
  if (points.length === 0) return []
  const limit = Math.max(1, max)
  const nodes = points.map((p) => ({ x: p.x, y: p.y, items: [p.item] }))
  for (let r = radius; ; r *= 1.5) {
    let groups = sweep(nodes, r)
    for (let i = 0; i < 4; i++) {
      const merged = sweep(groups, MIN_GAP)
      if (merged.length === groups.length) break
      groups = merged
    }
    if (groups.length <= limit) return groups
  }
}
