import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, ChevronRight, ChevronUp, Download, Globe, LogOut, Moon, type LucideIcon } from 'lucide-react'
import { BottomSheet } from '@/components/BottomSheet'
import { LanguagePicker } from '@/components/LanguagePicker'
import { useProfile } from '@/features/auth/useProfile'
import { useAuth } from '@/features/auth/AuthContext'
import { AvatarPicker } from '@/features/auth/AvatarPicker'
import { useJourneyContext } from '@/features/attendance/JourneyContext'
import { computeJourneyStats } from '@/features/attendance/journeyStats'
import type { DayJourney } from '@/features/attendance/useJourneyHistory'
import { useTheme } from '@/lib/ThemeContext'
import { LANGUAGES, getInitialLanguage } from '@/lib/language'
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
            <ProfileSection profile={profile} userId={session.user.id} onAvatarUploaded={refresh} />

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

            <button
              disabled={signingOut}
              onClick={async () => {
                haptic('light')
                setSigningOut(true)
                await signOut()
              }}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl2 bg-status-danger py-3.5 text-sm font-semibold text-white shadow-card tap-target disabled:opacity-60"
            >
              <LogOut className="h-4 w-4" aria-hidden />
              {signingOut ? 'Logging out…' : 'Log Out'}
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
    <div className="flex justify-between py-2">
      <dt className="text-neutral-500">{label}</dt>
      <dd className="font-medium text-neutral-900">{value}</dd>
    </div>
  )
}

function ProfileSection({
  profile,
  userId,
  onAvatarUploaded,
}: {
  profile: NonNullable<ReturnType<typeof useProfile>['profile']>
  userId: string
  onAvatarUploaded: () => void
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="overflow-hidden rounded-xl2 bg-brand-50 shadow-card">
      {/* AvatarPicker renders its own <button> (the edit badge) -- kept as
          a sibling of the expand/collapse toggle, not nested inside it,
          since browsers don't allow a <button> inside another <button>. */}
      <div className="flex items-center gap-4 p-4">
        <AvatarPicker userId={userId} photoPath={profile.photo_path} onUploaded={onAvatarUploaded} />
        <button
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="flex min-w-0 flex-1 items-center gap-2 text-left tap-target"
        >
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-semibold text-neutral-900">{profile.full_name}</p>
            <p className="truncate text-sm text-neutral-600">
              {profile.position || profile.role_name || '—'}
              {profile.position && profile.role_name ? ` · ${profile.role_name}` : ''}
            </p>
          </div>
          {expanded ? (
            <ChevronUp className="h-4 w-4 shrink-0 text-neutral-500" aria-hidden />
          ) : (
            <ChevronDown className="h-4 w-4 shrink-0 text-neutral-500" aria-hidden />
          )}
        </button>
      </div>

      {expanded && (
        <dl className="animate-fade-in-up divide-y divide-brand-100 px-4 pb-4 text-sm dark:divide-neutral-700">
          <Row label="Phone" value={profile.phone_primary || '—'} />
          <Row label="Email" value={profile.email || '—'} />
          <Row label="Employed since" value={profile.employment_date || '—'} />
        </dl>
      )}
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
    <div className="mt-3 rounded-xl2 bg-white p-4 shadow-card">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Today's Summary</p>
        <button onClick={() => navigate('/footprints')} className="flex items-center gap-0.5 text-xs font-semibold text-brand-600 tap-target">
          Full Report <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>

      <div className="mt-2.5 grid grid-cols-3 divide-x divide-neutral-100 text-center dark:divide-neutral-700">
        <SummaryStat label="Clock In" value={clockIn} />
        <SummaryStat label="Clock Out" value={clockOut} />
        <SummaryStat label="Total Hrs" value={totalWorking} />
      </div>
      <div className="mt-1.5 grid grid-cols-4 divide-x divide-neutral-100 border-t border-neutral-100 pt-1.5 text-center dark:divide-neutral-700 dark:border-neutral-800">
        <SummaryStat label="Visits" value={String(visits)} />
        <SummaryStat label="Active" value={activeTime} />
        <SummaryStat label="Gap" value={gap} />
        <SummaryStat label="Ratio" value={`${ratio}%`} />
      </div>
    </div>
  )
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-1 py-1">
      <p className="text-sm font-semibold tabular-nums text-neutral-900">{value}</p>
      <p className="mt-0.5 text-[10px] text-neutral-500">{label}</p>
    </div>
  )
}

function PreferencesSection() {
  const { theme, toggleTheme } = useTheme()
  const install = useInstallPrompt()
  const [language, setLanguageState] = useState(() => getInitialLanguage())
  const [showLanguage, setShowLanguage] = useState(false)
  const languageLabel = LANGUAGES.find((l) => l.code === language)?.nativeLabel ?? 'English'

  return (
    <div className="mt-3 overflow-hidden rounded-xl2 bg-white shadow-card">
      <p className="px-4 pt-3 text-xs font-semibold uppercase tracking-wide text-neutral-400">Preferences</p>

      <PrefRow
        icon={Moon}
        label="Dark Mode"
        control={
          <button
            role="switch"
            aria-checked={theme === 'dark'}
            aria-label="Toggle dark mode"
            onClick={() => {
              haptic('light')
              toggleTheme()
            }}
            className={`relative h-6 w-11 rounded-full transition-colors ${theme === 'dark' ? 'bg-brand-500' : 'bg-neutral-200'}`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                theme === 'dark' ? 'translate-x-[22px]' : 'translate-x-0.5'
              }`}
            />
          </button>
        }
      />

      <PrefRow
        icon={Globe}
        label="Language"
        onClick={() => {
          haptic('light')
          setShowLanguage(true)
        }}
        control={
          <span className="flex items-center gap-1 text-sm text-neutral-500">
            {languageLabel}
            <ChevronRight className="h-4 w-4" aria-hidden />
          </span>
        }
      />

      {install.canInstall && (
        <PrefRow
          icon={Download}
          label="Install App"
          onClick={() => {
            haptic('light')
            install.promptInstall()
          }}
          control={<ChevronRight className="h-4 w-4 text-neutral-300" aria-hidden />}
        />
      )}

      {install.needsIosInstructions && (
        <PrefRow icon={Download} label="Install App" sub='Tap Share, then "Add to Home Screen"' />
      )}

      <BottomSheet open={showLanguage} onClose={() => setShowLanguage(false)} title="Language">
        <div className="p-4">
          <LanguagePicker
            onSelect={(l) => {
              setLanguageState(l)
              setShowLanguage(false)
            }}
          />
        </div>
      </BottomSheet>
    </div>
  )
}

function PrefRow({
  icon: Icon,
  label,
  sub,
  control,
  onClick,
}: {
  icon: LucideIcon
  label: string
  sub?: string
  control?: ReactNode
  onClick?: () => void
}) {
  const Wrapper = onClick ? 'button' : 'div'
  return (
    <Wrapper
      onClick={onClick}
      className="flex w-full items-center gap-3 border-t border-neutral-100 px-4 py-3 text-left tap-target dark:border-neutral-800"
    >
      <Icon className="h-5 w-5 shrink-0 text-neutral-400" />
      <span className="flex-1">
        <span className="block text-sm font-medium text-neutral-800">{label}</span>
        {sub && <span className="mt-0.5 block text-xs text-neutral-400">{sub}</span>}
      </span>
      {control}
    </Wrapper>
  )
}
