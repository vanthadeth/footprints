import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  Briefcase,
  CalendarCheck,
  Check,
  ChevronRight,
  Download,
  Footprints,
  Globe,
  Loader2,
  LogOut,
  Mail,
  Moon,
  Pencil,
  Phone,
  Settings,
  Store,
  Tag,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useProfile } from '@/features/auth/useProfile'
import { useAuth } from '@/features/auth/AuthContext'
import { AvatarPicker } from '@/features/auth/AvatarPicker'
import { LogoutConfirmSheet } from '@/components/LogoutConfirmSheet'
import { AppBuildInfo } from '@/components/AppBuildInfo'
import { usersService } from '@/features/users/usersService'
import { useJourneyContext } from '@/features/attendance/JourneyContext'
import { leaveService } from '@/features/leave/leaveService'
import type { LeaveBalanceSummary } from '@/features/leave/types'
import { useCan } from '@/features/permissions/PermissionsContext'
import { useLanguage } from '@/i18n/LanguageContext'
import { useTheme } from '@/lib/ThemeContext'
import type { ThemeMode } from '@/lib/theme'
import { useInstallPrompt } from '@/hooks/useInstallPrompt'
import { formatTime } from '@/lib/datetime'
import { displayName } from '@/lib/displayName'
import { haptic } from '@/lib/haptic'

type Profile = NonNullable<ReturnType<typeof useProfile>['profile']>

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

/**
 * The signed-in person's own page, laid out like the design canvas
 * (Polish › Profile): a personal card, contact details, shortcuts to their
 * own work, leave left this year, quick settings, then sign out.
 */
export function ProfilePage() {
  const { profile, loading, refresh } = useProfile()
  const { session } = useAuth()
  const { t } = useLanguage()
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false)

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-[18px] px-4 pb-8 pt-2 md:max-w-2xl md:px-8">
      {loading ? (
        <div className="h-56 animate-pulse rounded-2xl bg-neutral-100" />
      ) : profile && session ? (
        <>
          <ProfileHero profile={profile} userId={session.user.id} onUpdated={refresh} />
          <ContactList profile={profile} userId={session.user.id} onUpdated={refresh} />
          <MyWork />
          <LeaveLeft userId={session.user.id} />
          <QuickSettings />
          <button
            onClick={() => {
              haptic('light')
              setLogoutConfirmOpen(true)
            }}
            className="flex h-[50px] w-full items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-white text-[15px] font-bold text-status-danger tap-target"
          >
            <LogOut className="h-[18px] w-[18px]" aria-hidden />
            {t('profile.signOut')}
          </button>
          <AppBuildInfo />
        </>
      ) : (
        <p className="text-sm text-neutral-500">{t('profile.couldNotLoad')}</p>
      )}

      <LogoutConfirmSheet open={logoutConfirmOpen} onClose={() => setLogoutConfirmOpen(false)} />
    </div>
  )
}

function ProfileHero({ profile, userId, onUpdated }: { profile: Profile; userId: string; onUpdated: () => void }) {
  const { t } = useLanguage()
  const { attendance, openAttendance } = useJourneyContext()
  const name = displayName(profile.full_name, profile.nickname)
  const working = attendance === 'CLOCKED_IN' && openAttendance
  const roleLine = [profile.role_name, profile.position].filter(Boolean).join(' · ')

  return (
    <section aria-label={name} className="flex flex-col items-center gap-1 pt-2 text-center">
      <AvatarPicker userId={userId} photoPath={profile.photo_path} onUploaded={onUpdated} initials={initialsOf(name)} />
      <h1 className="mt-3 text-[26px] font-bold leading-8 tracking-tight text-neutral-900">{name}</h1>
      {roleLine && <p className="text-sm text-neutral-500">{roleLine}</p>}
      <span
        className={`mt-1.5 inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-xs font-bold ${
          working ? 'bg-status-working/10 text-status-working' : 'bg-neutral-100 text-neutral-500'
        }`}
      >
        <span className={`h-[7px] w-[7px] rounded-full ${working ? 'bg-status-working' : 'border-2 border-neutral-400'}`} />
        {working ? t('profile.workingSince', { time: formatTime(openAttendance.clock_in_at) }) : t('profile.offShift')}
      </span>
    </section>
  )
}

function Card({ children }: { children: ReactNode }) {
  return <div className="overflow-hidden rounded-2xl border border-neutral-100 bg-white shadow-card">{children}</div>
}

function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="-mb-2.5 flex items-center justify-between px-1">
      <h2 className="text-xs font-bold uppercase tracking-[0.06em] text-neutral-500">{children}</h2>
      {action}
    </div>
  )
}

function IconTile({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] border-[1.5px] border-neutral-200 text-neutral-900">
      <Icon className="h-[18px] w-[18px]" aria-hidden />
    </span>
  )
}

function InfoRow({ icon, caption, value }: { icon: LucideIcon; caption: string; value: string }) {
  return (
    <div className="flex min-h-[58px] items-center gap-3 border-t border-neutral-100 px-3.5 py-2 first:border-t-0">
      <IconTile icon={icon} />
      <span className="min-w-0 flex-1">
        <span className="block text-xs text-neutral-500">{caption}</span>
        <span className="block truncate text-[15px] font-semibold text-neutral-900">{value}</span>
      </span>
    </div>
  )
}

function ContactList({ profile, userId, onUpdated }: { profile: Profile; userId: string; onUpdated: () => void }) {
  const { t } = useLanguage()
  return (
    <Card>
      <InfoRow icon={Phone} caption={t('profile.phone')} value={profile.phone_primary || '—'} />
      <InfoRow icon={Mail} caption={t('profile.email')} value={profile.email || '—'} />
      <NicknameRow userId={userId} nickname={profile.nickname} onSaved={onUpdated} />
      {profile.employment_date && <InfoRow icon={CalendarCheck} caption={t('profile.employedSince')} value={profile.employment_date} />}
    </Card>
  )
}

/** Self-service nickname edit: shown instead of the full name everywhere in the app once set (see displayName). A direct table write under users_update's own-row RLS -- see usersService.updateOwnNickname. */
function NicknameRow({ userId, nickname, onSaved }: { userId: string; nickname: string | null; onSaved: () => void }) {
  const { t } = useLanguage()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(nickname ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
      setError(e instanceof Error ? e.message : t('profile.nicknameSaveError'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex min-h-[58px] items-center gap-3 border-t border-neutral-100 px-3.5 py-2">
      <IconTile icon={Tag} />
      {editing ? (
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={t('profile.nicknamePlaceholder')}
              aria-label={t('profile.nickname')}
              className="h-10 min-w-0 flex-1 rounded-lg border-[1.5px] border-neutral-300 bg-white px-3 text-[15px] text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-brand-500 dark:bg-neutral-950"
            />
            <button
              onClick={handleSave}
              disabled={saving}
              aria-label="Save nickname"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-status-working/10 text-status-working tap-target disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            </button>
            <button
              onClick={() => setEditing(false)}
              disabled={saving}
              aria-label={t('common.cancel')}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-neutral-500 tap-target disabled:opacity-50"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {error && <p className="mt-1.5 text-xs text-status-danger">{error}</p>}
        </div>
      ) : (
        <button
          onClick={() => {
            setValue(nickname ?? '')
            setError(null)
            setEditing(true)
          }}
          className="flex min-w-0 flex-1 items-center gap-2 text-left tap-target"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-xs text-neutral-500">{t('profile.nickname')}</span>
            <span className="block truncate text-[15px] font-semibold text-neutral-900">{nickname || t('common.notSet')}</span>
          </span>
          <Pencil className="h-4 w-4 shrink-0 text-neutral-500" aria-hidden />
        </button>
      )}
    </div>
  )
}

function LinkRow({ icon, label, sub, to }: { icon: LucideIcon; label: string; sub: string; to: string }) {
  return (
    <Link to={to} className="flex min-h-[58px] items-center gap-3 border-t border-neutral-100 px-3.5 py-2 first:border-t-0">
      <IconTile icon={icon} />
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-neutral-900">{label}</span>
        <span className="block truncate text-xs text-neutral-500">{sub}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-neutral-500" aria-hidden />
    </Link>
  )
}

function MyWork() {
  const { t } = useLanguage()
  const canCustomers = useCan('customers')
  const canFootprints = useCan('footprints')
  return (
    <>
      <SectionTitle>{t('profile.myWork')}</SectionTitle>
      <Card>
        <LinkRow icon={CalendarCheck} label={t('profile.leaveAttendance')} sub={t('profile.leaveSub')} to="/leave" />
        <LinkRow icon={Briefcase} label={t('nav.trips')} sub={t('profile.tripsSub')} to="/trips" />
        {canCustomers && <LinkRow icon={Store} label={t('nav.customers')} sub={t('profile.customersSub')} to="/customers" />}
        {canFootprints && <LinkRow icon={Footprints} label={t('profile.myJourney')} sub={t('profile.journeySub')} to="/footprints" />}
      </Card>
    </>
  )
}

const fmtDays = (n: number) => (Number.isInteger(n) ? String(n) : n === Math.floor(n) + 0.5 ? `${Math.floor(n) || ''}½` : n.toFixed(1))

function LeaveLeft({ userId }: { userId: string }) {
  const { t } = useLanguage()
  const [rows, setRows] = useState<LeaveBalanceSummary[] | null>(null)

  useEffect(() => {
    let cancelled = false
    leaveService
      .listBalances(new Date().getFullYear())
      .then((all) => !cancelled && setRows(all.filter((r) => r.user_id === userId && (r.leave_type === 'annual' || r.leave_type === 'sick'))))
      .catch(() => !cancelled && setRows([]))
    return () => {
      cancelled = true
    }
  }, [userId])

  const label = (type: string | null) => (type === 'annual' ? t('profile.annual') : t('profile.sick'))
  return (
    <>
      <SectionTitle
        action={
          <Link to="/leave" className="text-[13px] font-bold text-brand-500">
            {t('profile.seeAll')}
          </Link>
        }
      >
        {t('profile.leaveLeft')}
      </SectionTitle>
      {rows === null ? (
        <div className="h-[92px] animate-pulse rounded-2xl bg-neutral-100" />
      ) : rows.length === 0 ? (
        <Card>
          <p className="px-3.5 py-4 text-sm text-neutral-500">{t('profile.noLeaveYet')}</p>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-2.5">
          {rows.map((r) => {
            const quota = r.quota_days ?? 0
            const left = r.remaining_days ?? 0
            const pct = quota > 0 ? Math.max(0, Math.min(100, (left / quota) * 100)) : 0
            return (
              <Link key={r.leave_type} to="/leave" className="rounded-2xl border border-neutral-100 bg-white p-3.5 shadow-card">
                <span className="block text-[13px] font-semibold text-neutral-500">{label(r.leave_type)}</span>
                <span className="mt-0.5 block text-[22px] font-bold text-neutral-900">
                  {fmtDays(left)}
                  <span className="text-[13px] font-semibold text-neutral-500">{t('profile.ofDays', { total: fmtDays(quota) })}</span>
                </span>
                <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-neutral-100">
                  <span className={`block h-full rounded-full ${r.leave_type === 'annual' ? 'bg-brand-500' : 'bg-status-working'}`} style={{ width: `${pct}%` }} />
                </span>
                <span className="mt-1.5 block text-xs text-neutral-500">{t('profile.usedDays', { n: fmtDays(r.used_days ?? 0) })}</span>
              </Link>
            )
          })}
        </div>
      )}
    </>
  )
}

function Segmented({ label, value, options, onChange }: { label: string; value: string; options: [string, string][]; onChange: (v: string) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex shrink-0 gap-0.5 rounded-[10px] bg-neutral-100 p-[3px]">
      {options.map(([k, text]) => {
        const on = k === value
        return (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => {
              haptic('light')
              onChange(k)
            }}
            className={`h-7 whitespace-nowrap rounded-[7px] px-2.5 text-xs ${on ? 'bg-white font-bold text-neutral-900 shadow-sm dark:bg-neutral-700' : 'font-semibold text-neutral-500'}`}
          >
            {text}
          </button>
        )
      })}
    </div>
  )
}

function QuickSettings() {
  const { t, language, setLanguage } = useLanguage()
  const { mode, setMode } = useTheme()
  const install = useInstallPrompt()
  const row = 'flex min-h-[58px] items-center gap-3 border-t border-neutral-100 px-3.5 py-2 first:border-t-0'
  return (
    <>
      <SectionTitle>{t('profile.settingsTitle')}</SectionTitle>
      <Card>
        <div className={row}>
          <IconTile icon={Globe} />
          <span className="flex-1 text-[15px] font-semibold text-neutral-900">{t('profile.language')}</span>
          <Segmented
            label={t('profile.language')}
            value={language}
            options={[
              ['en', 'English'],
              ['km', 'ខ្មែរ'],
            ]}
            onChange={(c) => setLanguage(c as 'en' | 'km')}
          />
        </div>
        <div className={row}>
          <IconTile icon={Moon} />
          <span className="flex-1 text-[15px] font-semibold text-neutral-900">{t('profile.theme')}</span>
          <Segmented
            label={t('profile.theme')}
            value={mode}
            options={[
              ['light', t('profile.themeLight')],
              ['dark', t('profile.themeDark')],
              ['system', t('profile.themeAuto')],
            ]}
            onChange={(m) => setMode(m as ThemeMode)}
          />
        </div>
        {(install.canInstall || install.needsIosInstructions) && (
          <button
            type="button"
            disabled={!install.canInstall}
            onClick={() => {
              haptic('light')
              install.promptInstall()
            }}
            className={`${row} w-full text-left`}
          >
            <IconTile icon={Download} />
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold text-neutral-900">{t('profile.installApp')}</span>
              {install.needsIosInstructions && <span className="block text-xs text-neutral-500">{t('profile.installIosHint')}</span>}
            </span>
            {install.canInstall && <ChevronRight className="h-4 w-4 text-neutral-500" aria-hidden />}
          </button>
        )}
        <Link to="/settings" className={row}>
          <IconTile icon={Settings} />
          <span className="flex-1 text-[15px] font-semibold text-neutral-900">{t('profile.moreSettings')}</span>
          <ChevronRight className="h-4 w-4 text-neutral-500" aria-hidden />
        </Link>
      </Card>
    </>
  )
}

