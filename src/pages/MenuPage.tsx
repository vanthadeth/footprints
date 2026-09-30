import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, Globe, HelpCircle, Info, LogOut, MapPin, Moon, Shield, User } from 'lucide-react'
import { InfoSheet } from '@/components/InfoSheet'
import { AppBuildInfo } from '@/components/AppBuildInfo'
import { LogoutConfirmSheet } from '@/components/LogoutConfirmSheet'
import { GroupedList, ListRow } from '@/components/GroupedList'
import { SegmentedControl } from '@/components/SegmentedControl'
import { LocationPermissionSheet } from '@/features/location/LocationPermissionSheet'
import { useProfile } from '@/features/auth/useProfile'
import { useAvatarUrl } from '@/features/auth/useAvatarUrl'
import { useRoleGroup } from '@/features/nav/useRoleGroup'
import { usePendingApprovals } from '@/features/nav/usePendingApprovals'
import { canApprove, forYou, hubSections } from '@/features/nav/navConfig'
import { useFlexCycle } from '@/features/flex/useFlexCycle'
import { useNotificationsContext } from '@/features/notifications/NotificationsContext'
import { useMessages } from '@/features/conversations/MessagesContext'
import { useLanguage } from '@/i18n/LanguageContext'
import { useTheme } from '@/lib/ThemeContext'
import { displayName } from '@/lib/displayName'
import type { ThemeMode } from '@/lib/theme'

type SheetKey = 'help' | 'location' | 'about' | 'privacy' | null


/**
 * Hub (bottom-bar tab, /menu): the profile card, then the person's role
 * group's "For you" shortcuts and Hub sections (features/nav/navConfig) --
 * only rows they can use, nothing that's already a tab -- then Preferences,
 * Support and Log out.
 */
export function MenuPage() {
  const { profile } = useProfile()
  const avatarUrl = useAvatarUrl(profile?.photo_path)
  const { language, setLanguage } = useLanguage()
  const { mode, setMode } = useTheme()
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false)
  const [openSheet, setOpenSheet] = useState<SheetKey>(null)
  const flex = useFlexCycle()
  const { group, ctx } = useRoleGroup(!!flex.cycle?.isFlexible)
  const pendingApprovals = usePendingApprovals(canApprove(ctx))
  const { unreadCount } = useNotificationsContext()
  const { unreadCount: unreadMessages } = useMessages()
  const badge = (key: string) => (key === 'approvals' ? pendingApprovals : key === 'messages' ? unreadMessages : key === 'notifications' ? unreadCount : undefined)
  const shortcuts = forYou(group, ctx)
  const sections = hubSections(group, ctx)

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

        {shortcuts.length > 0 && (
          <section className="space-y-2">
            <h2 className="px-0.5 text-[11px] font-bold uppercase tracking-wider text-neutral-500">For you</h2>
            <div className="grid grid-cols-4 gap-2">
              {shortcuts.map((q) => (
                <Link key={q.key} to={q.to} className="flex flex-col items-center gap-1.5">
                  <span className={`flex h-[54px] w-[54px] items-center justify-center rounded-2xl text-white ${q.tone}`}>
                    <q.icon className="h-[22px] w-[22px]" aria-hidden />
                  </span>
                  <span className="text-center text-xs font-semibold leading-tight text-neutral-600">{q.label}</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {sections.map((section) => (
          <GroupedList key={section.title} title={section.title}>
            {section.rows.map((r) => (
              <ListRow key={r.key} icon={r.icon} iconBg={r.tone} label={r.label} sublabel={r.sub} to={r.to} badge={badge(r.key)} />
            ))}
          </GroupedList>
        ))}

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
