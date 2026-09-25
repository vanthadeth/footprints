import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  BarChart3,
  Bell,
  Building2,
  CalendarCheck,
  CalendarDays,
  ChevronRight,
  Footprints as FootprintsIcon,
  Globe,
  HelpCircle,
  Info,
  Languages,
  LogOut,
  MapPin,
  Route,
  Store,
  Moon,
  Settings,
  Shield,
  User,
  Users as UsersIcon,
  type LucideIcon,
} from 'lucide-react'
import { InfoSheet } from '@/components/InfoSheet'
import { AppBuildInfo } from '@/components/AppBuildInfo'
import { LogoutConfirmSheet } from '@/components/LogoutConfirmSheet'
import { GroupedList, ListRow } from '@/components/GroupedList'
import { SegmentedControl } from '@/components/SegmentedControl'
import { LocationPermissionSheet } from '@/features/location/LocationPermissionSheet'
import { useProfile } from '@/features/auth/useProfile'
import { useAvatarUrl } from '@/features/auth/useAvatarUrl'
import { useHasTeam } from '@/features/fleet/useHasTeam'
import { leaveService } from '@/features/leave/leaveService'
import { useNotificationsContext } from '@/features/notifications/NotificationsContext'
import { useLanguage } from '@/i18n/LanguageContext'
import { useTheme } from '@/lib/ThemeContext'
import { displayName } from '@/lib/displayName'
import type { ThemeMode } from '@/lib/theme'

type SheetKey = 'help' | 'location' | 'about' | 'privacy' | null

const QUICK: { to: string; label: string; icon: LucideIcon; tone: string }[] = [
  { to: '/leave', label: 'Leave', icon: CalendarDays, tone: 'text-brand-500' },
  { to: '/footprints', label: 'Journey', icon: FootprintsIcon, tone: 'text-earth-500' },
  { to: '/report', label: 'Report', icon: BarChart3, tone: 'text-status-visiting dark:text-violet-300' },
  { to: '/leave?tab=attendance', label: 'Attendance', icon: CalendarCheck, tone: 'text-status-working dark:text-emerald-300' },
]

/**
 * Hub (bottom-bar tab, /menu): the signed-in user's profile card and
 * shortcuts, then iOS Settings-style groups -- Team (managers), Preferences,
 * Administration (super admins) and Support -- and Log out.
 */
export function MenuPage() {
  const { profile } = useProfile()
  const avatarUrl = useAvatarUrl(profile?.photo_path)
  const hasTeam = useHasTeam()
  const { language, setLanguage } = useLanguage()
  const { mode, setMode } = useTheme()
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false)
  const [openSheet, setOpenSheet] = useState<SheetKey>(null)
  const [pendingApprovals, setPendingApprovals] = useState(0)
  // Notifications visibility is gated on is_super_admin specifically --
  // that's the flag app.effective_scope() actually keys off of (see the
  // notifications_center migration), not a role_name string check.
  const isSuperAdmin = profile?.is_super_admin === true
  const isManager = isSuperAdmin || hasTeam
  const { unreadCount } = useNotificationsContext()

  useEffect(() => {
    if (!isManager || !profile) return
    let cancelled = false
    leaveService
      .listRequests()
      .then((rows) => {
        if (!cancelled) setPendingApprovals(rows.filter((r) => r.status === 'pending' && r.user_id !== profile.id).length)
      })
      .catch(() => {
        // Only a badge -- a failed count just means no number, not an error on the whole Hub.
      })
    return () => {
      cancelled = true
    }
  }, [isManager, profile])

  const name = profile ? displayName(profile.full_name, profile.nickname) : ''
  const roleLine = [profile?.position, profile?.role_name].filter(Boolean).join(' · ')

  return (
    <div className="mx-auto max-w-lg md:max-w-2xl">
      <div className="space-y-5 px-4 pb-6 pt-1 md:px-8 md:pt-4">
        <Link to="/profile" className="flex items-center gap-3.5 rounded-2xl bg-white p-3.5 shadow-card">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-500 text-[22px] font-bold text-white">
            {avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" /> : name[0]?.toUpperCase() || <User className="h-6 w-6" aria-hidden />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-lg font-bold text-neutral-900">{name || '…'}</span>
            {roleLine && <span className="block truncate text-[13px] text-neutral-500">{roleLine}</span>}
          </span>
          <span className="text-xs font-bold text-brand-500">Profile</span>
          <ChevronRight className="h-4 w-4 text-neutral-400" aria-hidden />
        </Link>

        <div className="grid grid-cols-4 gap-2">
          {QUICK.map((q) => (
            <Link key={q.to} to={q.to} className="flex flex-col items-center gap-1.5">
              <span className={`flex h-[54px] w-[54px] items-center justify-center rounded-full border border-neutral-200 bg-white ${q.tone}`}>
                <q.icon className="h-[22px] w-[22px]" aria-hidden />
              </span>
              <span className="text-xs font-semibold text-neutral-600">{q.label}</span>
            </Link>
          ))}
        </div>

        <GroupedList title="Selling">
          <ListRow icon={Route} iconBg="bg-brand-500" label="Today's plan" sublabel="Your stops, route and next customer" to="/plan" />
          <ListRow icon={Store} iconBg="bg-status-warn" label="Customer coverage" sublabel="Who's due or overdue for a visit" to="/customers/coverage" />
        </GroupedList>

        {isManager && (
          <GroupedList title="Team">
            <ListRow icon={UsersIcon} iconBg="bg-brand-500" label="Team" sublabel="Status, map, reports, logs & attendance" to="/fleet" />
            <ListRow icon={CalendarCheck} iconBg="bg-status-warn" label="Leave approvals" badge={pendingApprovals} to="/leave/approvals" />
          </GroupedList>
        )}

        <GroupedList title="Preferences">
          <ListRow
            icon={Globe}
            iconBg="bg-brand-600"
            label="Language"
            trailing={
              <SegmentedControl
                ariaLabel="Language"
                shape="tabs"
                value={language}
                onChange={setLanguage}
                className="w-[128px] shrink-0"
                options={[
                  { value: 'en', label: 'EN' },
                  { value: 'km', label: 'ខ្មែរ' },
                ]}
              />
            }
          />
          <ListRow
            icon={Moon}
            iconBg="bg-neutral-600"
            label="Appearance"
            trailing={
              <SegmentedControl<ThemeMode>
                ariaLabel="Appearance"
                shape="tabs"
                value={mode}
                onChange={setMode}
                className="w-[176px] shrink-0 [&_button]:px-2"
                options={[
                  { value: 'system', label: 'Auto' },
                  { value: 'light', label: 'Light' },
                  { value: 'dark', label: 'Dark' },
                ]}
              />
            }
          />
        </GroupedList>

        {isSuperAdmin && (
          <GroupedList title="Administration">
            <ListRow icon={UsersIcon} iconBg="bg-status-visiting" label="Users" to="/users" />
            <ListRow icon={Building2} iconBg="bg-status-working" label="Work locations" to="/locations" />
            <ListRow icon={Bell} iconBg="bg-status-danger" label="Notifications" badge={unreadCount} to="/notifications" />
            <ListRow icon={Languages} iconBg="bg-brand-600" label="Translations" to="/translations" />
            <ListRow icon={Settings} iconBg="bg-neutral-600" label="System settings" to="/settings" />
          </GroupedList>
        )}

        <GroupedList title="Support">
          <ListRow icon={HelpCircle} iconBg="bg-brand-500" label="Help & support" onClick={() => setOpenSheet('help')} />
          <ListRow icon={MapPin} iconBg="bg-status-working" label="Location permission" onClick={() => setOpenSheet('location')} />
          <ListRow icon={Shield} iconBg="bg-neutral-600" label="Privacy" onClick={() => setOpenSheet('privacy')} />
          <ListRow icon={Info} iconBg="bg-earth-500" label="About Footprints" onClick={() => setOpenSheet('about')} />
        </GroupedList>

        <div className="space-y-2">
          <button
            onClick={() => setLogoutConfirmOpen(true)}
            className="flex h-[50px] w-full items-center justify-center gap-2 rounded-2xl bg-status-danger text-[15px] font-bold text-white tap-target"
          >
            <LogOut className="h-[18px] w-[18px]" aria-hidden />
            Log out
          </button>
          <p className="text-center text-xs text-neutral-500">
            {profile?.email ? `Signed in as ${profile.email} · ` : ''}Footprints v{__APP_VERSION__}
          </p>
        </div>
      </div>

      <InfoSheet open={openSheet === 'help'} onClose={() => setOpenSheet(null)} title="Help">
        <p>Need help using Footprints? Contact your supervisor or HIG IT support.</p>
      </InfoSheet>

      <LocationPermissionSheet open={openSheet === 'location'} onClose={() => setOpenSheet(null)} />

      <InfoSheet open={openSheet === 'about'} onClose={() => setOpenSheet(null)} title="About Footprints">
        <p className="font-medium text-neutral-900">Footprints, by HIG</p>
        <p>Journal your sales journey — attendance, customer visits, and your working day, all in one place.</p>
        <AppBuildInfo />
      </InfoSheet>

      <InfoSheet open={openSheet === 'privacy'} onClose={() => setOpenSheet(null)} title="Privacy">
        <p>
          Footprints records your clock-in/out selfies, GPS location, and customer visit activity as part of your
          employment with HIG. This data is visible to you, your supervisors, and system administrators, and is used
          only for attendance verification, visit tracking, and management reporting.
        </p>
      </InfoSheet>

      <LogoutConfirmSheet open={logoutConfirmOpen} onClose={() => setLogoutConfirmOpen(false)} />
    </div>
  )
}
