import { useAuth } from '@/features/auth/AuthContext'
import { JourneyHistoryReport } from '@/features/attendance/JourneyHistoryReport'

/** The signed-in user's own day-by-day journey history. See JourneyHistoryReport for the shared UI. */
export function FootprintsPage() {
  const { session } = useAuth()
  return <JourneyHistoryReport userId={session?.user.id ?? null} interactive />
}
