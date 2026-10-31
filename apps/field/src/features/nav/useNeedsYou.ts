import { useEffect, useState } from 'react'
import { useProfile } from '@footprints/shared/features/auth/useProfile'
import { supabase } from '@footprints/shared/lib/supabase'
import { formatTime } from '@footprints/shared/lib/datetime'
import { useMessages } from '@/features/conversations/MessagesContext'
import { useJourneyContext } from '@/features/attendance/JourneyContext'
import { usePlan } from '@/features/plan/usePlan'
import { leaveService } from '@/features/leave/leaveService'
import { tripService } from '@/features/trips/tripService'
import { flexService } from '@/features/flex/flexService'
import { holidaysService } from '@/features/holidays/holidaysService'
import { daysUntil, holidayName, nextHoliday } from '@/features/holidays/holidays'
import { counted } from '@/features/flex/progress'
import { todayDateString } from '@/lib/dateRange'
import type { NeedsData } from './needsYou'
import type { RoleGroup } from './navConfig'

const EMPTY: NeedsData = { toDecide: 0, ownPending: 0, plannedStops: 0, nextStop: null, annualLeft: null, shortPeople: [], nextHoliday: null, unreadMessages: 0, onShiftSince: null, lastSync: null }

/**
 * What the Hub's "Needs you" card reads, fetched only for what the role group
 * shows. Every source is best-effort: a failed load just leaves that line out.
 */
export function useNeedsYou(group: RoleGroup, canDecide: boolean, tNow: (iso: string) => string = formatTime): NeedsData {
  const { profile } = useProfile()
  const today = todayDateString()
  const { unreadCount } = useMessages()
  const journey = useJourneyContext()
  const plan = usePlan(today)
  const [data, setData] = useState<NeedsData>(EMPTY)
  const [leaveWaiting, setLeaveWaiting] = useState(0)
  const [tripsWaiting, setTripsWaiting] = useState(0)

  useEffect(() => {
    if (!profile) return
    let cancelled = false
    const patch = (p: Partial<NeedsData>) => !cancelled && setData((d) => ({ ...d, ...p }))
    const year = Number(today.slice(0, 4))
    leaveService
      .listRequests()
      .then((rows) => {
        patch({ ownPending: rows.filter((r) => r.status === 'pending' && r.user_id === profile.id).length })
        if (canDecide) setLeaveWaiting(rows.filter((r) => r.status === 'pending' && r.user_id !== profile.id).length)
      })
      .catch(() => {})
    if (canDecide) {
      tripService
        .team()
        .then((rows) => !cancelled && setTripsWaiting(rows.filter((t) => t.can_decide || t.can_transfer).length))
        .catch(() => {})
    }
    if (group === 'field' || group === 'office') {
      leaveService
        .listBalances(year)
        .then((rows) => patch({ annualLeft: rows.find((r) => r.user_id === profile.id && r.leave_type === 'annual')?.remaining_days ?? null }))
        .catch(() => {})
    }
    if (group === 'manager' || group === 'hr' || group === 'admin') {
      flexService
        .teamProgress(null)
        .then((rows) => patch({ shortPeople: rows.filter((r) => r.isFlexible && !r.settled && r.spare < 0).map((r) => ({ name: r.name, have: counted(r), min: r.minDays ?? 0 })) }))
        .catch(() => {})
    }
    if (group === 'hr') {
      holidaysService
        .listYear(year)
        .then((rows) => {
          const h = nextHoliday(rows, today)
          patch({ nextHoliday: h ? { name: holidayName(h.name), inDays: Math.max(0, daysUntil(today, h.startDate)) } : null })
        })
        .catch(() => {})
    }
    if (group === 'admin') {
      void supabase
        .from('sync_runs')
        .select('status, started_at')
        .order('started_at', { ascending: false })
        .limit(1)
        .then(({ data: rows }) => {
          const r = rows?.[0]
          if (r && r.status !== 'running') patch({ lastSync: { ok: r.status === 'ok', time: tNow(r.started_at) } })
        })
    }
    return () => {
      cancelled = true
    }
  }, [profile, group, canDecide, today, tNow])

  const planned = plan.items.filter((i) => i.status === 'planned')
  return {
    ...data,
    toDecide: canDecide ? leaveWaiting + tripsWaiting : 0,
    unreadMessages: unreadCount,
    plannedStops: planned.length,
    nextStop: planned[0]?.shop_name ?? null,
    onShiftSince: journey.openAttendance ? tNow(journey.openAttendance.clock_in_at) : null,
  }
}
