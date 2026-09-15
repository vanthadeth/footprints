import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { MapPin, Clock, Footprints as FootprintsIcon, Truck, User, Menu as MenuIcon, Users as UsersIcon, type LucideIcon } from 'lucide-react'
import { haptic } from '@/lib/haptic'
import { OfflineBanner } from '@/components/OfflineBanner'
import { TitleBar } from '@/components/TitleBar'
import { JourneyProvider, useJourneyContext } from '@/features/attendance/JourneyContext'
import { NotificationsProvider } from '@/features/notifications/NotificationsContext'
import { useProfile, type Profile } from '@/features/auth/useProfile'

/** Desktop keeps the full set of destinations as a vertical rail -- screen space isn't the constraint there that it is on a phone's bottom bar. */
const DESKTOP_TABS = [
  { to: '/check-in', label: 'Check In', icon: MapPin },
  { to: '/footprints', label: 'Footprints', icon: FootprintsIcon },
  { to: '/fleet', label: 'Fleet', icon: Truck },
  { to: '/profile', label: 'Profile', icon: User },
  { to: '/menu', label: 'Menu', icon: MenuIcon },
]

/**
 * Mobile-first shell. One nav for everyone (the field-sales-specific nav
 * this project briefly had -- Home / Customers / + / Visits / More -- is
 * disabled for now, see StartPage/CustomersPage): a 3-item bottom bar on
 * phones (Profile / Check In (raised, center) / Footprints), growing to 5
 * for a super admin (+ Users, + Fleet), and the 5-item desktop rail.
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

          <MobileTabBar profile={profile} />
        </div>
      </NotificationsProvider>
    </JourneyProvider>
  )
}

function DesktopSidebar({ profile }: { profile: Profile | null }) {
  const { attendance } = useJourneyContext()
  const checkInLabel = attendance === 'CLOCKED_IN' ? 'Check In' : 'Clock In'

  const tabs = profile?.is_super_admin ? [...DESKTOP_TABS, { to: '/users', label: 'Users', icon: UsersIcon }] : DESKTOP_TABS

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
          {tab.to === '/check-in' ? checkInLabel : tab.label}
        </NavLink>
      ))}
    </nav>
  )
}

function MobileTabBar({ profile }: { profile: Profile | null }) {
  const { attendance } = useJourneyContext()
  const isClockedIn = attendance === 'CLOCKED_IN'
  const checkInLabel = isClockedIn ? 'Check In' : 'Clock In'
  const CheckInIcon = isClockedIn ? MapPin : Clock
  const isSuperAdmin = profile?.is_super_admin === true

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 border-t border-neutral-200 bg-white/95 backdrop-blur safe-bottom md:hidden"
      aria-label="Primary"
    >
      <div className="mx-auto flex max-w-lg items-end justify-between px-2">
        <MobileTabLink to="/profile" icon={User} label="Profile" />
        {isSuperAdmin && <MobileTabLink to="/users" icon={UsersIcon} label="Users" />}

        <NavLink to="/check-in" onClick={() => haptic('light')} className="relative -mt-7 flex flex-1 flex-col items-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-500 text-white shadow-card ring-4 ring-neutral-50 dark:ring-neutral-950">
            <CheckInIcon className="h-6 w-6" aria-hidden />
          </span>
          <span className="mt-1 pb-2 text-[11px] font-semibold text-brand-600">{checkInLabel}</span>
        </NavLink>

        <MobileTabLink to="/footprints" icon={FootprintsIcon} label="Footprints" />
        {isSuperAdmin && <MobileTabLink to="/fleet" icon={Truck} label="Fleet" />}
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
        `flex flex-1 flex-col items-center gap-1 py-2 text-[11px] font-medium tap-target ${isActive ? 'text-brand-600' : 'text-neutral-400'}`
      }
    >
      {({ isActive }) => (
        <>
          <Icon className="h-6 w-6" strokeWidth={isActive ? 2.5 : 2} aria-hidden />
          {label}
        </>
      )}
    </NavLink>
  )
}
