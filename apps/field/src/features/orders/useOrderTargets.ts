import { useEffect, useMemo, useState } from 'react'
import { callRpc } from '@footprints/shared/lib/rpc'
import { useAppSettings } from '@/hooks/useAppSettings'
import { useAttendanceDays } from '@/features/attendanceSummary/useAttendanceDays'
import { todayDateString } from '@/lib/dateRange'
import { monthBounds, personTargets, type PersonTarget } from './orderTargets'

interface TargetRow {
  userId: string
  monthly: number | null
  required: boolean
}

/**
 * Each person's sales target for everyone the caller can see (public.team_order_targets): the monthly target (their own, else
 * the company's), whether they have to achieve one, and the day's share of it (the monthly target divided by their working
 * days this month). Empty until it answers.
 */
export function useOrderTargetDetails(): Record<string, PersonTarget> {
  const settings = useAppSettings()
  const [rows, setRows] = useState<TargetRow[]>([])
  useEffect(() => {
    let cancelled = false
    callRpc<{ user_id: string; monthly_order_target_usd: number | null; sales_target_required: boolean }[]>('team_order_targets')
      .then((data) => {
        if (cancelled) return
        setRows((data ?? []).map((r) => ({ userId: r.user_id, monthly: r.monthly_order_target_usd == null ? null : Number(r.monthly_order_target_usd), required: r.sales_target_required !== false })))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])
  const ids = useMemo(() => rows.map((r) => r.userId), [rows])
  const { from, to } = useMemo(() => monthBounds(todayDateString()), [])
  const month = useAttendanceDays(from, to, ids)
  return useMemo(() => personTargets(rows, settings.monthlyOrderTargetUsd, month.rows), [rows, settings.monthlyOrderTargetUsd, month.rows])
}

/**
 * Each person's daily share of their monthly sales target in USD, for scoring (0: no target, so no orders part in the score).
 * A person who has not loaded yet is missing, and scoring then falls back to the company's share.
 */
export function useOrderTargets(): Record<string, number | null> {
  const details = useOrderTargetDetails()
  return useMemo(() => Object.fromEntries(Object.entries(details).map(([id, t]) => [id, t.daily])), [details])
}
