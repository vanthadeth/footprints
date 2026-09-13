import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronRight, Download, LogOut, Menu as MenuIcon, Moon, Truck } from 'lucide-react'
import { StatTile } from '@/components/StatTile'
import { LanguagePicker } from '@/components/LanguagePicker'
import { useProfile } from '@/features/auth/useProfile'
import { useAuth } from '@/features/auth/AuthContext'
import { AvatarPicker } from '@/features/auth/AvatarPicker'
import { useJourneyContext } from '@/features/attendance/JourneyContext'
import { computeJourneyStats } from '@/features/attendance/journeyStats'
import type { DayJourney } from '@/features/attendance/useJourneyHistory'
import { useTheme } from '@/lib/ThemeContext'
import { useInstallPrompt } from '@/hooks/useInstallPrompt'
import { formatDuration, formatTime } from '@/lib/datetime'
import { haptic } from '@/lib/haptic'

export function ProfilePage() {
  const { profile, loading, refresh } = useProfile()
  const { session, signOut } = useAuth()
  const journey = useJourneyContext()
  const [signingOut, setSigningOut] = useState(false)

  const today: DayJourney = { date: '', attendance: journey.openAttendance, visits: journey.todaysVisits }
  const stats = computeJourneyStats([today])
  const activeRatio = stats.totalWorkingMs > 0 ? Math.round((stats.totalVisitingMs / stats.totalWorkingMs) * 100) : 0

  return (
    <div className="mx-auto max-w-lg pb-6 md:max-w-2xl">
      <div className="px-4 pt-4 md:px-8">
        {loading ? (
          <div className="animate-pulse rounded-xl2 bg-neutral-100 p-6" />
        ) : profile && session ? (
          <>
            <div className="rounded-xl2 bg-white p-5 shadow-card">
              <div className="flex items-center gap-4">
                <AvatarPicker userId={session.user.id} photoPath={profile.photo_path} onUploaded={refresh} />
                <div className="min-w-0">
                  <p className="truncate text-lg font-semibold text-neutral-900">{profile.full_name}</p>
                  <p className="truncate text-sm text-neutral-500">
                    {profile.position || profile.role_name || '—'}
                    {profile.position && profile.role_name ? ` · ${profile.role_name}` : ''}
                  </p>
                </div>
              </div>

              <dl className="mt-6 divide-y divide-neutral-100 text-sm dark:divide-neutral-800">
                <Row label="Phone" value={profile.phone_primary || '—'} />
                <Row label="Email" value={profile.email || '—'} />
                <Row label="Employed since" value={profile.employment_date || '—'} />
              </dl>
            </div>

            <TodaySummary
              clockIn={journey.openAttendance ? formatTime(journey.openAttendance.clock_in_at) : '--:--'}
              clockOut={journey.openAttendance?.clock_out_at ? formatTime(journey.openAttendance.clock_out_at) : '--:--'}
              totalWorking={formatDuration(stats.totalWorkingMs)}
              visits={stats.totalVisits}
              activeTime={formatDuration(stats.totalVisitingMs)}
              gap={formatDuration(stats.totalGapMs)}
              ratio={activeRatio}
            />

            <PreferencesSection />

            {/* Fleet/Menu moved off the (now 3-item) bottom bar -- Profile is
                where they live now. Fleet is shown to everyone; the my_team
                RPC it reads from is RBAC-scoped server-side and simply comes
                back empty for anyone with no reports, same as before. */}
            <div className="mt-4 overflow-hidden rounded-xl2 bg-white shadow-card">
              <Link to="/fleet" className="flex items-center gap-3 px-4 py-3.5 text-left text-sm font-medium text-neutral-800 tap-target">
                <Truck className="h-5 w-5 text-neutral-400" aria-hidden />
                <span className="flex-1">Fleet</span>
                <ChevronRight className="h-4 w-4 text-neutral-300" aria-hidden />
              </Link>
              <Link
                to="/menu"
                className="flex items-center gap-3 border-t border-neutral-100 px-4 py-3.5 text-left text-sm font-medium text-neutral-800 tap-target"
              >
                <MenuIcon className="h-5 w-5 text-neutral-400" aria-hidden />
                <span className="flex-1">Menu</span>
                <ChevronRight className="h-4 w-4 text-neutral-300" aria-hidden />
              </Link>
            </div>

            <button
              disabled={signingOut}
              onClick={async () => {
                haptic('light')
                setSigningOut(true)
                await signOut()
              }}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl2 bg-white py-3.5 text-sm font-semibold text-status-danger shadow-card tap-target disabled:opacity-60"
            >
              <LogOut className="h-4 w-4" aria-hidden />
              {signingOut ? 'Signing out…' : 'Sign Out'}
            </button>
          </>
        ) : (
          <p className="text-sm text-neutral-500">We couldn't load your profile.</p>
        )}
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-2.5">
      <dt className="text-neutral-500">{label}</dt>
      <dd className="font-medium text-neutral-900">{value}</dd>
    </div>
  )
}

function TodaySummary({
  clockIn,
  clockOut,
  totalWorking,
  visits,
  activeTime,
  gap,
  ratio,
}: {
  clockIn: string
  clockOut: string
  totalWorking: string
  visits: number
  activeTime: string
  gap: string
  ratio: number
}) {
  const navigate = useNavigate()

  return (
    <div className="mt-4 rounded-xl2 bg-white p-5 shadow-card">
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Today's Summary</p>

      <div className="mt-3 grid grid-cols-3 divide-x divide-neutral-100 text-center dark:divide-neutral-700">
        <SummaryStat label="Clock In" value={clockIn} />
        <SummaryStat label="Clock Out" value={clockOut} />
        <SummaryStat label="Total Hours" value={totalWorking} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <StatTile label="Visits" value={String(visits)} />
        <StatTile label="Active Time" value={activeTime} />
        <StatTile label="Gap Time" value={gap} />
        <StatTile label="Active Ratio" value={`${ratio}%`} />
      </div>

      <button
        onClick={() => navigate('/footprints')}
        className="mt-4 flex w-full items-center justify-center gap-1 rounded-xl bg-neutral-50 py-3 text-sm font-semibold text-brand-600 tap-target dark:bg-neutral-800"
      >
        See Full Report <ChevronRight className="h-4 w-4" aria-hidden />
      </button>
    </div>
  )
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-1">
      <p className="text-base font-semibold tabular-nums text-neutral-900">{value}</p>
      <p className="mt-0.5 text-[11px] text-neutral-500">{label}</p>
    </div>
  )
}

function PreferencesSection() {
  const { theme, toggleTheme } = useTheme()
  const install = useInstallPrompt()

  return (
    <div className="mt-4 overflow-hidden rounded-xl2 bg-white shadow-card">
      <p className="px-4 pt-3.5 text-xs font-semibold uppercase tracking-wide text-neutral-400">Preferences</p>

      <div className="flex items-center gap-3 px-4 py-3.5">
        <Moon className="h-5 w-5 text-neutral-400" aria-hidden />
        <span className="flex-1 text-sm font-medium text-neutral-800">Dark Mode</span>
        <button
          role="switch"
          aria-checked={theme === 'dark'}
          aria-label="Toggle dark mode"
          onClick={() => {
            haptic('light')
            toggleTheme()
          }}
          className={`relative h-7 w-12 rounded-full transition-colors ${theme === 'dark' ? 'bg-brand-500' : 'bg-neutral-200'}`}
        >
          <span
            className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${
              theme === 'dark' ? 'translate-x-[22px]' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>

      <div className="border-t border-neutral-100 px-4 py-3.5">
        <p className="mb-2.5 text-sm font-medium text-neutral-800">Language</p>
        <LanguagePicker />
      </div>

      {install.canInstall && (
        <button
          onClick={() => {
            haptic('light')
            install.promptInstall()
          }}
          className="flex w-full items-center gap-3 border-t border-neutral-100 px-4 py-3.5 text-left tap-target"
        >
          <Download className="h-5 w-5 text-neutral-400" aria-hidden />
          <span className="flex-1 text-sm font-medium text-neutral-800">Install Footprints App</span>
          <ChevronRight className="h-4 w-4 text-neutral-300" aria-hidden />
        </button>
      )}

      {install.needsIosInstructions && (
        <div className="flex items-center gap-3 border-t border-neutral-100 px-4 py-3.5">
          <Download className="h-5 w-5 text-neutral-400" aria-hidden />
          <span className="flex-1">
            <span className="block text-sm font-medium text-neutral-800">Install Footprints App</span>
            <span className="mt-0.5 block text-xs text-neutral-400">Tap Share, then "Add to Home Screen"</span>
          </span>
        </div>
      )}
    </div>
  )
}
