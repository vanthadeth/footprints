import { useCallback, useEffect, useState } from 'react'
import { useJourneyContext } from '@/features/attendance/JourneyContext'
import { planService, type PlanItem } from './planService'

/**
 * The plan for one day. Refetches whenever a visit starts or ends
 * (my_plan ticks off the stop you just checked in at), and exposes
 * optimistic helpers so reordering/skipping feels instant.
 */
export function usePlan(date: string) {
  const journey = useJourneyContext()
  const [items, setItems] = useState<PlanItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const rows = await planService.list(date)
      setItems(rows)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your plan.')
    } finally {
      setLoading(false)
    }
  }, [date])

  const openVisitId = journey.openVisit?.id ?? null
  const visitCount = journey.todaysVisits.length
  useEffect(() => {
    setLoading(true)
    void refresh()
  }, [refresh, openVisitId, visitCount])

  /** Runs a write, then refetches; on failure shows the error and refetches to undo any optimistic change. */
  async function mutate(write: () => Promise<void>, optimistic?: (prev: PlanItem[]) => PlanItem[]) {
    if (optimistic) setItems(optimistic)
    try {
      await write()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That change did not save.')
    }
    await refresh()
  }

  return {
    items,
    loading,
    error,
    refresh,
    add: (customerId: string, source: 'manual' | 'suggested' = 'manual') => mutate(() => planService.add(date, customerId, source)),
    remove: (itemId: string) => mutate(() => planService.remove(itemId), (prev) => prev.filter((i) => i.item_id !== itemId)),
    setSkipped: (itemId: string, skipped: boolean) =>
      mutate(
        () => planService.setSkipped(itemId, skipped),
        (prev) => prev.map((i) => (i.item_id === itemId ? { ...i, status: skipped ? 'skipped' : 'planned' } : i))
      ),
    reorder: (orderedIds: string[]) =>
      mutate(
        () => planService.reorder(date, orderedIds),
        (prev) => orderedIds.map((id) => prev.find((i) => i.item_id === id)).filter((i): i is PlanItem => !!i)
      ),
  }
}
