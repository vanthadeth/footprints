import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TeamOverview } from '@footprints/shared/components/TeamOverview'
import { TeamPerformance } from '@footprints/shared/components/TeamPerformance'
import { useFleet } from '@/features/fleet/useFleet'
import { useTeamWorkDays } from '@/features/schedule/useTeamWorkDays'
import { useApprovedLeaveOnDate } from '@/features/leave/useApprovedLeaveOnDate'
import { useVisitOrders, useVisitOrderTotals } from '@/features/orders/useVisitOrders'
import { useOrderTargets } from '@/features/orders/useOrderTargets'
import { buildOverview, buildPerformance } from '@/features/teamOverview/teamOverviewAdapter'
import { useNewCustomersToday } from '@/features/teamOverview/useNewCustomersToday'
import { useAppSettings } from '@/hooks/useAppSettings'
import { getPresetRange, todayDateString } from '@/lib/dateRange'

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
  const orderTargets = useOrderTargets()
  const startOfToday = useMemo(() => getPresetRange('today').startIso, [])
  const newCustomers = useNewCustomersToday(ids, startOfToday)
  // The strips and "absent" move with the clock.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [])

  const overview = useMemo(
    () => buildOverview({ snapshots: field, leave, workDays, defaults: { start: settings.workStartTime, end: settings.workEndTime }, graceMin: settings.flagRules.lateGraceMin, forgottenCapMin: settings.flagRules.forgottenCapMin, now }),
    [field, leave, workDays, settings.workStartTime, settings.workEndTime, settings.flagRules.lateGraceMin, settings.flagRules.forgottenCapMin, now],
  )
  const visits = useMemo(() => field.flatMap((s) => s.visitsToday.filter((v) => !v.cancelled_at)), [field])
  const orderStates = useVisitOrders(visits)
  const orderTotals = useVisitOrderTotals(visits)
  const performance = useMemo(
    () => buildPerformance({ overview, visits, orderStates, orderTotals, orderTargets, dailyOrderTargetUsd: settings.dailyOrderTargetUsd, dailyVisitTarget: settings.dailyVisitTarget, newCustomers }),
    [overview, visits, orderStates, orderTotals, orderTargets, settings.dailyOrderTargetUsd, settings.dailyVisitTarget, newCustomers],
  )

  return (
    <div className="mx-auto max-w-lg space-y-3 px-4 pb-10 pt-1.5 md:max-w-3xl md:px-8">
      {error && <p role="alert" className="rounded-xl bg-status-danger/10 px-3 py-2 text-sm text-status-danger">{error}</p>}
      <TeamPerformance performance={performance} />
      <TeamOverview people={overview.people} loading={loading} onOpenPerson={(id) => navigate(`/team/footprints/${id}`)} />
      <p className="px-1 text-xs text-neutral-500">
        Sales count each synced sale order once, even when two people visited the same customer, plus amounts entered on visits still waiting for the sync; targets add up over the people working today. Late is minutes after start time plus grace, as in the attendance roster.
      </p>
    </div>
  )
}
