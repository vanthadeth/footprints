import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { LeaveType } from './types'

/**
 * Which of these users has an approved leave covering `date` -- used to
 * show "On Annual Leave" instead of a bare "Not clocked in" wherever a
 * manager reviews a specific day (CheckInOutTab, JourneyHistoryReport).
 * Relies on the same app.can('leave','view',...) RLS every other leave
 * read already does -- a viewer only ever sees this for people they could
 * already see attendance for.
 */
export function useApprovedLeaveOnDate(userIds: string[], date: string): Record<string, LeaveType> {
  const [byUserId, setByUserId] = useState<Record<string, LeaveType>>({})
  const idsKey = [...new Set(userIds)].sort().join(',')

  useEffect(() => {
    const ids = idsKey ? idsKey.split(',') : []
    if (ids.length === 0) {
      setByUserId({})
      return
    }
    let cancelled = false
    supabase
      .from('leave_requests')
      .select('user_id, leave_type')
      .in('user_id', ids)
      .eq('status', 'approved')
      .lte('start_date', date)
      .gte('end_date', date)
      .then(({ data }) => {
        if (cancelled || !data) return
        setByUserId(Object.fromEntries(data.map((r) => [r.user_id, r.leave_type])))
      })
    return () => {
      cancelled = true
    }
  }, [idsKey, date])

  return byUserId
}
