import { useMemo } from 'react'
import { useAppSettings } from '@/hooks/useAppSettings'
import { useAttendanceDays } from '@/features/attendanceSummary/useAttendanceDays'
import { useVisitOrders, useVisitOrderTotals } from '@/features/orders/useVisitOrders'
import { getCustomRange, todayDateString } from '@/lib/dateRange'
import { computeJourneyStats } from './journeyStats'
import { dayContextFrom } from './dayContext'
import { useJourneyHistory } from './useJourneyHistory'
import type { ScoredDay } from './scoreProgress'
import type { VisitRow } from './types'

const HISTORY_DAYS = 56

const shift = (date: string, days: number) => {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

/**
 * The last eight weeks of a person's daily scores, scored the way the Day summary scores them
 * (server paid time and hours, synced order values, their own order target). Null user: nothing is fetched.
 */
export function useScoreHistory(userId: string | null, orderTargetUsd: number | null): { days: ScoredDay[]; visits: VisitRow[]; loading: boolean } {
  const settings = useAppSettings()
  const today = todayDateString()
  const from = shift(today, -(HISTORY_DAYS - 1))
  const range = useMemo(() => getCustomRange(from, today), [from, today])
  const history = useJourneyHistory(userId, range)
  const server = useAttendanceDays(from, today, userId ? [userId] : [])
  const orderStates = useVisitOrders(history.allVisits)
  const orderTotals = useVisitOrderTotals(history.allVisits)
  const days = useMemo<ScoredDay[]>(() => {
    if (!userId) return []
    const rule = { breakMinutes: settings.breakMinutes, breakPaid: settings.breakPaid, start: settings.workStartTime, end: settings.workEndTime }
    const stats = computeJourneyStats(history.days, undefined, rule, settings.flagRules, orderStates, dayContextFrom(server.rows, today, rule), { orderTargetUsd, orderTotals })
    return stats.dayScores.map((d) => ({ date: d.date ?? '', score: d.score }))
  }, [userId, history.days, server.rows, today, settings.breakMinutes, settings.breakPaid, settings.workStartTime, settings.workEndTime, settings.flagRules, orderStates, orderTotals, orderTargetUsd])
  return { days, visits: history.allVisits, loading: history.loading || server.loading }
}
