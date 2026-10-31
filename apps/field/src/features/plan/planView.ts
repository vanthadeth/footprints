import type { PlanItem } from './planService'

export type SegmentState = 'done' | 'next' | 'todo' | 'skipped'

/** One segment per stop for the progress bar: done, the next one to visit, the rest still to do, skipped. */
export function planSegments(items: Pick<PlanItem, 'status' | 'item_id'>[]): SegmentState[] {
  const next = items.find((i) => i.status === 'planned')?.item_id
  return items.map((i) => (i.status === 'done' ? 'done' : i.status === 'skipped' ? 'skipped' : i.item_id === next ? 'next' : 'todo'))
}

export type EdgeTone = 'ok' | 'warn' | 'bad' | 'mute'

/** The colour of a stop's edge, from days since the last visit (same bands as the Customers list); done and skipped stops are neutral. */
export function edgeTone(item: Pick<PlanItem, 'status'>, days: number | null): EdgeTone {
  if (item.status === 'done') return 'ok'
  if (item.status === 'skipped') return 'mute'
  if (days == null || days > 45) return 'bad'
  return days > 30 ? 'warn' : 'ok'
}

/** Moves one id to a new position and returns the new order (the input is not changed). */
export function moveItem<T>(ids: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= ids.length || to >= ids.length) return ids
  const next = [...ids]
  const [it] = next.splice(from, 1)
  next.splice(to, 0, it)
  return next
}
