import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TeamOverview } from '@footprints/shared/components/TeamOverview'
import { TeamPerformance } from '@footprints/shared/components/TeamPerformance'
import { useFleet } from '@/features/fleet/useFleet'
import { useTeamWorkDays } from '@/features/schedule/useTeamWorkDays'
import { useApprovedLeaveOnDate } from '@/features/leave/useApprovedLeaveOnDate'
import { useVisitOrders, useVisitOrderTotals } from '@/features/orders/useVisitOrders'
import { useOrderTargetDetails } from '@/features/orders/useOrderTargets'
import { addDays } from '@/features/attendanceSummary/attendanceCycle'
import { useAttendanceDays } from '@/features/attendanceSummary/useAttendanceDays'
import { buildMonth, buildOverview, buildPerformance } from '@/features/teamOverview/teamOverviewAdapter'
import { useMonthVisits } from '@/features/teamOverview/useMonthVisits'
import { useNewCustomersSince } from '@/features/teamOverview/useNewCustomersSince'
import { useAppSettings } from '@/hooks/useAppSettings'
import { getPresetRange, localDateKey, todayDateString } from '@/lib/dateRange'

/**
 * Team (manager view): the team's day against its targets, four numbers that filter the list, then each person with their day strip.
 * A new page next to the Team tab, reached from Hub > New features; the Team tab stays as it is for now.
 */
export function TeamOverviewPage() {
  const navigate = useNavigate()
  const settings = useAppSettings()
  const { snapshots, loading, error } = useFleet()
  const today = todayDateString()
  const field = useMemo(() => snapshots.filter((s) => s.member.isFieldSales), [snapshots])
  const ids = useMemo(() => field.map((s) => s.member.id), [field])
  const leave = useApprovedLeaveOnDate(ids, today)
  const workDays = useTeamWorkDays(today)
  const targetDetails = useOrderTargetDetails()
  const monthlyTargets = useMemo(() => Object.fromEntries(Object.entries(targetDetails).map(([id, t]) => [id, t.monthly])), [targetDetails])
  const dailyTargets = useMemo(() => Object.fromEntries(Object.entries(targetDetails).map(([id, t]) => [id, t.daily])), [targetDetails])
  const startOfToday = useMemo(() => getPresetRange('today').startIso, [])
  const newCustomers = useNewCustomersSince(ids, startOfToday)
  // The month so far: its first day, and its last (the range ends at the start of next month).
  const monthRange = useMemo(() => getPresetRange('this_month'), [])
  const monthFrom = localDateKey(monthRange.startIso)
  const monthTo = addDays(localDateKey(monthRange.endIso), -1)
  const newCustomersMonth = useNewCustomersSince(ids, monthRange.startIso)
  const monthDays = useAttendanceDays(monthFrom, monthTo, ids)
  const { visits: monthVisits } = useMonthVisits(ids, monthRange.startIso, monthRange.endIso)
  const monthOrderStates = useVisitOrders(monthVisits)
  const monthOrderTotals = useVisitOrderTotals(monthVisits)
  // The strips and "absent" move with the clock.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [])

  const visits = useMemo(() => field.flatMap((s) => s.visitsToday.filter((v) => !v.cancelled_at)), [field])
  const orderStates = useVisitOrders(visits)
  const orderTotals = useVisitOrderTotals(visits)
  const overview = useMemo(
    () => buildOverview({ snapshots: field, leave, workDays, defaults: { start: settings.workStartTime, end: settings.workEndTime }, graceMin: settings.flagRules.lateGraceMin, forgottenCapMin: settings.flagRules.forgottenCapMin, now, orderStates, orderTotals }),
    [field, leave, workDays, settings.workStartTime, settings.workEndTime, settings.flagRules.lateGraceMin, settings.flagRules.forgottenCapMin, now, orderStates, orderTotals],
  )
  const month = useMemo(
    () =>
      monthDays.loading
        ? null
        : buildMonth({ rows: monthDays.rows, today, visits: monthVisits, orderStates: monthOrderStates, orderTotals: monthOrderTotals, monthlyTargets, dailyVisitTarget: settings.dailyVisitTarget, newCustomers: newCustomersMonth }),
    [monthDays.loading, monthDays.rows, today, monthVisits, monthOrderStates, monthOrderTotals, monthlyTargets, settings.dailyVisitTarget, newCustomersMonth],
  )
  const performance = useMemo(
    () => buildPerformance({ overview, visits, orderStates, orderTotals, dailyTargets, dailyVisitTarget: settings.dailyVisitTarget, newCustomers, month }),
    [overview, visits, orderStates, orderTotals, dailyTargets, settings.dailyVisitTarget, newCustomers, month],
  )

  return (
    <div className="mx-auto max-w-lg space-y-3 px-4 pb-10 pt-1.5 md:max-w-3xl md:px-8">
      {error && <p role="alert" className="rounded-xl bg-status-danger/10 px-3 py-2 text-sm text-status-danger">{error}</p>}
      <TeamPerformance performance={performance} />
      <TeamOverview people={overview.people} loading={loading} onOpenPerson={(id) => navigate(`/team/footprints/${id}`)} />
      <p className="px-1 text-xs text-neutral-500">
        Sales count each synced sale order once, even when two people visited the same customer, plus amounts entered on visits still waiting for the sync, and only for people who have a sales target. The month's target is the sum of their monthly targets; today's is their share of it for the people working today. Late is minutes after start time plus grace, as in the attendance roster. A person's orders and amount are their own visits'; a shared order shows on both cards. Pace is the share of the month's working days gone, from the attendance records.
      </p>
    </div>
  )
}
