import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, ChevronDown, ChevronRight, ChevronUp, Download, Globe, Loader2, LogOut, Pencil, X, type LucideIcon } from 'lucide-react'
import { useProfile } from '@/features/auth/useProfile'
import { useAuth } from '@/features/auth/AuthContext'
import { AvatarPicker } from '@/features/auth/AvatarPicker'
import { usersService } from '@/features/users/usersService'
import { useJourneyContext } from '@/features/attendance/JourneyContext'
import { computeJourneyStats } from '@/features/attendance/journeyStats'
import { summarizeAttendanceTimes } from '@/features/attendance/stateMachine'
import type { DayJourney } from '@/features/attendance/useJourneyHistory'
import { getInitialLanguage, setLanguage } from '@/lib/language'
import { displayName } from '@/lib/displayName'
import { useInstallPrompt } from '@/hooks/useInstallPrompt'
import { formatDuration, formatTime } from '@/lib/datetime'
import { haptic } from '@/lib/haptic'

export function ProfilePage() {
  const { profile, loading, refresh } = useProfile()
  const { session, signOut } = useAuth()
  const journey = useJourneyContext()
  const [signingOut, setSigningOut] = useState(false)

  // Multiple clock-in/clock-out sessions are allowed in one day -- summed
  // across all of today's sessions, not just whichever one is open now.
  const today: DayJourney = { date: '', attendance: journey.todaysAttendance, visits: journey.todaysVisits }
  const stats = computeJourneyStats([today])
  const activeRatio = stats.totalWorkingMs > 0 ? Math.round((stats.totalVisitingMs / stats.totalWorkingMs) * 100) : 0
  const { clockInTime, clockOutTime } = summarizeAttendanceTimes(journey.todaysAttendance, journey.openAttendance)

  return (
    <div className="mx-auto max-w-lg pb-6 md:max-w-2xl">
      <div className="px-4 pt-4 md:px-8">
        {loading ? (
          <div className="animate-pulse rounded-xl2 bg-neutral-100 p-6" />
        ) : profile && session ? (
          <>
            <ProfileSection profile={profile} userId={session.user.id} onUpdated={refresh} />

            <TodaySummary
              clockIn={clockInTime ? formatTime(clockInTime) : '--:--'}
              clockOut={clockOutTime ? formatTime(clockOutTime) : '--:--'}
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
  onUpdated,
}: {
  profile: NonNullable<ReturnType<typeof useProfile>['profile']>
  userId: string
  onUpdated: () => void
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="overflow-hidden rounded-xl2 bg-brand-50 shadow-card">
      {/* AvatarPicker renders its own <button> (the edit badge) -- kept as
          a sibling of the expand/collapse toggle, not nested inside it,
          since browsers don't allow a <button> inside another <button>. */}
      <div className="flex items-center gap-4 p-4">
        <AvatarPicker userId={userId} photoPath={profile.photo_path} onUploaded={onUpdated} />
        <button
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="flex min-w-0 flex-1 items-center gap-2 text-left tap-target"
        >
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-semibold text-neutral-900">{displayName(profile.full_name, profile.nickname)}</p>
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
          <NicknameRow userId={userId} nickname={profile.nickname} onSaved={onUpdated} />
          <Row label="Phone" value={profile.phone_primary || '—'} />
          <Row label="Email" value={profile.email || '—'} />
          <Row label="Employed since" value={profile.employment_date || '—'} />
        </dl>
      )}
    </div>
  )
}

/** Self-service nickname edit: shown instead of the full name everywhere in the app once set (see displayName). A direct table write under users_update's own-row RLS -- see usersService.updateOwnNickname. */
function NicknameRow({ userId, nickname, onSaved }: { userId: string; nickname: string | null; onSaved: () => void }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(nickname ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function startEdit() {
    setValue(nickname ?? '')
    setError(null)
    setEditing(true)
  }

  async function handleSave() {
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      await usersService.updateOwnNickname(userId, value.trim() || null)
      haptic('success')
      onSaved()
      setEditing(false)
    } catch (e) {
      haptic('error')
      setError(e instanceof Error ? e.message : 'Could not save your nickname.')
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <div className="py-2">
        <div className="flex items-center gap-2">
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="e.g. Bear"
            className="min-w-0 flex-1 rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-sm text-neutral-900 placeholder:text-neutral-400"
          />
          <button
            onClick={handleSave}
            disabled={saving}
            aria-label="Save nickname"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-status-working/10 text-status-working tap-target disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          </button>
          <button
            onClick={() => setEditing(false)}
            disabled={saving}
            aria-label="Cancel"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-neutral-400 tap-target disabled:opacity-50"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        {error && <p className="mt-1.5 text-xs text-status-danger">{error}</p>}
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <dt className="text-neutral-500">Nickname</dt>
      <button onClick={startEdit} className="flex items-center gap-1.5 tap-target">
        <dd className="font-medium text-neutral-900">{nickname || 'Not set'}</dd>
        <Pencil className="h-3.5 w-3.5 text-neutral-400" aria-hidden />
      </button>
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
  const install = useInstallPrompt()
  const [language, setLanguageState] = useState(() => getInitialLanguage())

  return (
    <div className="mt-3 overflow-hidden rounded-xl2 bg-white shadow-card">
      <p className="px-4 pt-3 text-xs font-semibold uppercase tracking-wide text-neutral-400">Preferences</p>

      {/* Dark Mode lives in Settings → Appearance now (one designated
          control instead of one scattered across every screen) -- see
          AppearanceControl. */}
      <PrefRow
        icon={Globe}
        label="Language"
        control={
          <div className="flex rounded-full bg-neutral-100 p-0.5 dark:bg-neutral-800">
            {(['km', 'en'] as const).map((code) => (
              <button
                key={code}
                onClick={() => {
                  haptic('light')
                  setLanguage(code)
                  setLanguageState(code)
                }}
                aria-pressed={language === code}
                className={`rounded-full px-2.5 py-1 text-xs font-semibold tap-target ${
                  language === code ? 'bg-white text-brand-700 shadow-sm dark:bg-neutral-700 dark:text-brand-300' : 'text-neutral-500'
                }`}
              >
                {code === 'km' ? 'KH' : 'EN'}
              </button>
            ))}
          </div>
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
