import { NavLink, Outlet } from 'react-router-dom'
import { MapPin, Clock, Footprints as FootprintsIcon, Truck, User, Menu as MenuIcon } from 'lucide-react'
import { haptic } from '@/lib/haptic'
import { OfflineBanner } from '@/components/OfflineBanner'
import { JourneyProvider, useJourneyContext } from '@/features/attendance/JourneyContext'
import { LogoIcon } from '@/components/Logo'

/** Desktop keeps the full set of destinations as a vertical rail -- screen space isn't the constraint there that it is on a phone's bottom bar. */
const DESKTOP_TABS = [
  { to: '/check-in', label: 'Check In', icon: MapPin },
  { to: '/footprints', label: 'Footprints', icon: FootprintsIcon },
  { to: '/fleet', label: 'Fleet', icon: Truck },
  { to: '/profile', label: 'Profile', icon: User },
  { to: '/menu', label: 'Menu', icon: MenuIcon },
]

/**
 * Mobile-first shell: a 3-item bottom tab bar on phones (Profile / Check In
 * (raised, center) / Footprints) with a left rail on wider viewports.
 * Fleet and Menu don't disappear -- they're one tap away from Profile --
 * they just don't compete for space on the bottom bar (spec: 3-item nav,
 * center tab re-labels itself by attendance state).
 */
export function AppLayout() {
  return (
    <JourneyProvider>
      <div className="flex min-h-dvh flex-col bg-neutral-50 md:flex-row">
        <OfflineBanner />
        <DesktopSidebar />

        <main className="flex-1 pb-[calc(4.75rem+env(safe-area-inset-bottom))] md:pb-0">
          <Outlet />
        </main>

        <MobileTabBar />
      </div>
    </JourneyProvider>
  )
}

function DesktopSidebar() {
  const { attendance } = useJourneyContext()
  const checkInLabel = attendance === 'CLOCKED_IN' ? 'Check In' : 'Clock In'

  return (
    <nav
      className="hidden shrink-0 flex-col gap-1 border-r border-neutral-200 bg-white p-3 md:flex md:w-56"
      aria-label="Primary"
    >
      <div className="mb-4 flex items-center gap-2 px-2 pt-2">
        <LogoIcon className="h-7 w-7" />
        <span className="text-lg font-semibold text-brand-600">Footprints</span>
      </div>
      {DESKTOP_TABS.map((tab) => (
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

function MobileTabBar() {
  const { attendance } = useJourneyContext()
  const isClockedIn = attendance === 'CLOCKED_IN'
  const checkInLabel = isClockedIn ? 'Check In' : 'Clock In'
  const CheckInIcon = isClockedIn ? MapPin : Clock

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 border-t border-neutral-200 bg-white/95 backdrop-blur safe-bottom md:hidden"
      aria-label="Primary"
    >
      <div className="mx-auto flex max-w-lg items-end justify-between px-4">
        <NavLink
          to="/profile"
          onClick={() => haptic('light')}
          className={({ isActive }) =>
            `flex flex-1 flex-col items-center gap-1 py-2 text-[11px] font-medium tap-target ${
              isActive ? 'text-brand-600' : 'text-neutral-400'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <User className="h-6 w-6" strokeWidth={isActive ? 2.5 : 2} aria-hidden />
              Profile
            </>
          )}
        </NavLink>

        <NavLink to="/check-in" onClick={() => haptic('light')} className="relative -mt-7 flex flex-1 flex-col items-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-500 text-white shadow-card ring-4 ring-neutral-50 dark:ring-neutral-950">
            <CheckInIcon className="h-6 w-6" aria-hidden />
          </span>
          <span className="mt-1 pb-2 text-[11px] font-semibold text-brand-600">{checkInLabel}</span>
        </NavLink>

        <NavLink
          to="/footprints"
          onClick={() => haptic('light')}
          className={({ isActive }) =>
            `flex flex-1 flex-col items-center gap-1 py-2 text-[11px] font-medium tap-target ${
              isActive ? 'text-brand-600' : 'text-neutral-400'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <FootprintsIcon className="h-6 w-6" strokeWidth={isActive ? 2.5 : 2} aria-hidden />
              Footprints
            </>
          )}
        </NavLink>
      </div>
    </nav>
  )
}
