import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { MapPin, Clock, Footprints as FootprintsIcon, Truck, CalendarDays, BarChart3, LayoutGrid, Users as UsersIcon, type LucideIcon } from 'lucide-react'
import { haptic } from '@/lib/haptic'
import { OfflineBanner } from '@/components/OfflineBanner'
import { TitleBar } from '@/components/TitleBar'
import { JourneyProvider, useJourneyContext } from '@/features/attendance/JourneyContext'
import { NotificationsProvider } from '@/features/notifications/NotificationsContext'
import { useHasTeam } from '@/features/fleet/useHasTeam'
import { useProfile, type Profile } from '@/features/auth/useProfile'
import { useLanguage } from '@/i18n/LanguageContext'

/** The five destinations every user gets, in bottom-bar order (Check In sits in the middle of the phone bar as the raised action). */
const PRIMARY_TABS = [
  { to: '/footprints', labelKey: 'nav.footprints', icon: FootprintsIcon },
  { to: '/leave', labelKey: 'nav.leave', icon: CalendarDays },
  { to: '/check-in', labelKey: 'nav.checkIn', icon: MapPin },
  { to: '/report', labelKey: 'nav.report', icon: BarChart3 },
  { to: '/menu', labelKey: 'nav.hub', icon: LayoutGrid },
] as const

/**
 * Mobile-first shell. One nav for everyone: a 5-item bottom bar on phones
 * (Footprints / Leave / Check In (raised, center) / Report / Hub) and the
 * same five on the desktop rail, plus Team and Users there for the people
 * who can see them. On phones Team, Users, Profile and the admin screens
 * live in Hub (/menu).
 */
export function AppLayout() {
  const location = useLocation()
  const { profile } = useProfile()

  return (
    <JourneyProvider>
      <NotificationsProvider>
        <div className="flex min-h-dvh flex-col bg-neutral-50 md:flex-row">
          <OfflineBanner />
          <DesktopSidebar profile={profile} />

          <div className="flex min-w-0 flex-1 flex-col">
            <TitleBar />

            <main className="flex-1 pb-[calc(4.75rem+env(safe-area-inset-bottom))] md:pb-0">
              {/* Keying by path remounts this div on every tab switch, which
                  restarts the fade-in-up animation -- a lightweight stand-in
                  for a real route-transition library. */}
              <div key={location.pathname} className="animate-fade-in-up">
                <Outlet />
              </div>
            </main>
          </div>

          <MobileTabBar />
        </div>
      </NotificationsProvider>
    </JourneyProvider>
  )
}

function DesktopSidebar({ profile }: { profile: Profile | null }) {
  const { attendance } = useJourneyContext()
  const { t } = useLanguage()
  const hasTeam = useHasTeam()
  const isSuperAdmin = profile?.is_super_admin === true
  const checkInLabel = attendance === 'CLOCKED_IN' ? t('nav.checkIn') : t('nav.clockIn')

  const tabs: { to: string; labelKey: string; icon: LucideIcon }[] = [
    PRIMARY_TABS[2],
    PRIMARY_TABS[0],
    PRIMARY_TABS[1],
    PRIMARY_TABS[3],
    ...(isSuperAdmin || hasTeam ? [{ to: '/fleet', labelKey: 'nav.fleet', icon: Truck }] : []),
    ...(isSuperAdmin ? [{ to: '/users', labelKey: 'nav.users', icon: UsersIcon }] : []),
    PRIMARY_TABS[4],
  ]

  return (
    <nav
      className="hidden shrink-0 flex-col gap-1 border-r border-neutral-200 bg-white p-3 pt-4 md:flex md:w-56"
      aria-label="Primary"
    >
      {/* No logo/brand block here -- TitleBar (to the right) already shows it, alongside the current page's title. */}
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              isActive ? 'bg-brand-50 text-brand-700' : 'text-neutral-600 hover:bg-neutral-100'
            }`
          }
        >
          <tab.icon className="h-5 w-5" aria-hidden />
          {tab.to === '/check-in' ? checkInLabel : t(tab.labelKey)}
        </NavLink>
      ))}
    </nav>
  )
}

function MobileTabBar() {
  const { attendance } = useJourneyContext()
  const { t } = useLanguage()
  const isClockedIn = attendance === 'CLOCKED_IN'
  const checkInLabel = isClockedIn ? t('nav.checkIn') : t('nav.clockIn')
  const CheckInIcon = isClockedIn ? MapPin : Clock

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 border-t border-neutral-200 bg-white/95 backdrop-blur safe-bottom md:hidden"
      aria-label="Primary"
    >
      <div className="mx-auto flex max-w-lg items-start justify-between px-1 pt-2">
        <MobileTabLink to="/footprints" icon={FootprintsIcon} label={t('nav.footprints')} />
        <MobileTabLink to="/leave" icon={CalendarDays} label={t('nav.leave')} />

        <NavLink to="/check-in" onClick={() => haptic('light')} className="relative -mt-8 flex flex-1 flex-col items-center gap-1">
          {({ isActive }) => (
            <>
              <span className="flex h-[58px] w-[58px] items-center justify-center rounded-full bg-brand-500 text-white shadow-[0_6px_16px_rgba(22,104,184,0.35)] ring-4 ring-neutral-50 dark:ring-neutral-950">
                <CheckInIcon className="h-6 w-6" aria-hidden />
              </span>
              <span className={`pb-2 text-[11px] font-bold ${isActive ? 'text-brand-700' : 'text-neutral-500'}`}>{checkInLabel}</span>
            </>
          )}
        </NavLink>

        <MobileTabLink to="/report" icon={BarChart3} label={t('nav.report')} />
        <MobileTabLink to="/menu" icon={LayoutGrid} label={t('nav.hub')} />
      </div>
    </nav>
  )
}

function MobileTabLink({ to, icon: Icon, label }: { to: string; icon: LucideIcon; label: string }) {
  return (
    <NavLink
      to={to}
      onClick={() => haptic('light')}
      className={({ isActive }) =>
        `flex flex-1 flex-col items-center gap-1 pb-2 text-[11px] tap-target ${isActive ? 'font-bold text-brand-700' : 'font-semibold text-neutral-500'}`
      }
    >
      {({ isActive }) => (
        <>
          <span
            className={`flex h-[30px] w-14 items-center justify-center rounded-full ${isActive ? 'bg-brand-50' : ''}`}
          >
            <Icon className="h-[22px] w-[22px]" strokeWidth={isActive ? 2.3 : 1.9} aria-hidden />
          </span>
          {label}
        </>
      )}
    </NavLink>
  )
}
