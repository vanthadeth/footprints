import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Users as UsersIcon } from 'lucide-react'
import { TeamAttendanceCalendar } from '@footprints/shared/components/TeamCalendar'
import { EmptyState } from '@/components/EmptyState'
import { useTeam } from '@/features/fleet/useTeam'
import { toRosterData } from '@/features/attendanceSummary/rosterAdapter'
import { useRosterAttendance } from '@/features/attendanceSummary/useRosterAttendance'
import { todayDateString } from '@/lib/dateRange'

/**
 * Attendance roster: every active person the viewer may see (a Super Admin sees everyone), one row each, a month or a week at a time.
 * Hidden for now: reachable by URL for Super Admins only (see RequireSuperAdmin), not linked from any menu.
 */
export function AttendanceRosterPage() {
  const navigate = useNavigate()
  const today = todayDateString()
  const { team, loading: teamLoading, error: teamError } = useTeam()
  const { rows, loading, error, loadRange } = useRosterAttendance()
  const data = useMemo(() => toRosterData(team, rows, today), [team, rows, today])

  return (
    <div className="mx-auto max-w-[1500px] space-y-3 px-4 pb-10 pt-1.5 lg:pt-6">
      <p className="text-sm text-neutral-500">
        {teamLoading ? 'Loading people...' : `${team.length} active ${team.length === 1 ? 'person' : 'people'}`} · late minutes are minutes late in; early clock-out is not counted here yet.
      </p>

      {(teamError || error) && <p role="alert" className="rounded-xl bg-status-danger/10 px-3 py-2 text-sm text-status-danger">{teamError ?? error}</p>}

      {teamLoading ? (
        <div className="h-64 animate-pulse rounded-2xl bg-neutral-100" />
      ) : team.length === 0 && !teamError ? (
        <EmptyState icon={UsersIcon} title="No active people to show" body="Active people you are allowed to see appear here." />
      ) : (
        <TeamAttendanceCalendar data={data} loading={loading} onRangeChange={loadRange} onOpenPerson={(id) => navigate(`/team/footprints/${id}`)} />
      )}
    </div>
  )
}
