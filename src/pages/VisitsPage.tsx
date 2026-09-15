import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarClock, Footprints as FootprintsIcon } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'
import { useAuth } from '@/features/auth/AuthContext'
import { useJourneyContext } from '@/features/attendance/JourneyContext'
import { JourneyTimeline } from '@/features/attendance/JourneyTimeline'
import { useUpcomingVisits } from '@/features/visits/useUpcomingVisits'
import { useCustomerNames } from '@/features/customers/useCustomerNames'
import { useLanguage } from '@/i18n/LanguageContext'
import { formatDate } from '@/lib/datetime'
import { FootprintsPage } from './FootprintsPage'

type Tab = 'today' | 'upcoming' | 'history'

const TABS: { key: Tab; labelKey: string }[] = [
  { key: 'today', labelKey: 'common.today' },
  { key: 'upcoming', labelKey: 'visits.tabUpcoming' },
  { key: 'history', labelKey: 'visits.tabHistory' },
]

/** The field nav's Visits screen: today's visits, promised-return dates from past visit records, and (reusing FootprintsPage as-is) full day-by-day history. */
export function VisitsPage() {
  const { t } = useLanguage()
  const [tab, setTab] = useState<Tab>('today')

  return (
    <div className="mx-auto max-w-lg pb-6 md:max-w-2xl">
      <div className="px-4 pt-4 md:px-8">
        <div className="flex gap-1 rounded-full bg-neutral-100 p-1">
          {TABS.map((item) => (
            <button
              key={item.key}
              onClick={() => setTab(item.key)}
              className={`flex-1 rounded-full px-4 py-2 text-sm font-semibold tap-target ${
                tab === item.key ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500'
              }`}
            >
              {t(item.labelKey)}
            </button>
          ))}
        </div>
      </div>

      {tab === 'today' && <TodayTab />}
      {tab === 'upcoming' && <UpcomingTab />}
      {tab === 'history' && <FootprintsPage />}
    </div>
  )
}

function TodayTab() {
  const { t } = useLanguage()
  const journey = useJourneyContext()
  const customerNames = useCustomerNames([...journey.todaysVisits.map((v) => v.customer_id), journey.openVisit?.customer_id ?? null])

  const hasActivity = journey.todaysAttendance.length > 0 || journey.todaysVisits.length > 0

  if (journey.loading) {
    return (
      <div className="px-4 pt-4 md:px-8">
        <div className="h-40 animate-pulse rounded-xl2 bg-neutral-100" />
      </div>
    )
  }

  return (
    <div className="px-4 pt-4 md:px-8">
      {!hasActivity ? (
        <EmptyState icon={FootprintsIcon} title={t('visits.todayEmptyTitle')} body={t('visits.todayEmptyBody')} />
      ) : (
        <div className="rounded-xl2 bg-white p-4 shadow-card">
          <JourneyTimeline
            attendance={journey.todaysAttendance}
            visits={journey.todaysVisits}
            customerNames={customerNames}
            interactive
            onVisitChanged={journey.refresh}
          />
        </div>
      )}
    </div>
  )
}

function UpcomingTab() {
  const { t } = useLanguage()
  const { session } = useAuth()
  const navigate = useNavigate()
  const { visits, loading, error } = useUpcomingVisits(session?.user.id ?? null)
  const customerNames = useCustomerNames(visits.map((v) => v.customer_id))

  if (loading) {
    return (
      <div className="px-4 pt-4 md:px-8">
        <div className="space-y-2">
          <div className="h-16 animate-pulse rounded-xl2 bg-neutral-100" />
          <div className="h-16 animate-pulse rounded-xl2 bg-neutral-100" />
        </div>
      </div>
    )
  }

  return (
    <div className="px-4 pt-4 md:px-8">
      {error && <p className="mb-3 rounded-lg bg-status-danger/10 px-3 py-2 text-sm text-status-danger">{error}</p>}
      {visits.length === 0 ? (
        <EmptyState icon={CalendarClock} title={t('visits.upcomingEmptyTitle')} body={t('visits.upcomingEmptyBody')} />
      ) : (
        <div className="space-y-2">
          {visits.map((v) => (
            <button
              key={v.id}
              onClick={() => v.customer_id && navigate(`/customers/${v.customer_id}`)}
              className="flex w-full items-center gap-3 rounded-xl2 bg-white p-3.5 text-left shadow-card tap-target"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-500">
                <CalendarClock className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-neutral-900">
                  {v.customer_id ? (customerNames[v.customer_id] ?? t('common.loading')) : t('common.unassignedVisit')}
                </span>
                <span className="text-xs text-neutral-400">{formatDate(v.next_appointment)}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
