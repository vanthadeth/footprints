import { NavLink, Outlet } from 'react-router-dom'
import { MapPin, Footprints as FootprintsIcon, Truck, User, Menu as MenuIcon } from 'lucide-react'
import { haptic } from '@/lib/haptic'

const TABS = [
  { to: '/check-in', label: 'Check In', icon: MapPin },
  { to: '/footprints', label: 'Footprints', icon: FootprintsIcon },
  { to: '/fleet', label: 'Fleet', icon: Truck },
  { to: '/profile', label: 'Profile', icon: User },
  { to: '/menu', label: 'Menu', icon: MenuIcon },
]

/**
 * Mobile-first shell: bottom tab bar on phones, a left rail on wider
 * viewports (desktop gets a more spacious layout, per spec, without a
 * second implementation -- same routes, same components, CSS does the work).
 */
export function AppLayout() {
  return (
    <div className="flex min-h-dvh flex-col bg-neutral-50 md:flex-row">
      <nav
        className="hidden shrink-0 flex-col gap-1 border-r border-neutral-200 bg-white p-3 md:flex md:w-56"
        aria-label="Primary"
      >
        <div className="mb-4 px-2 pt-2 text-lg font-semibold text-brand-600">Footprints</div>
        {TABS.map((tab) => (
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
            {tab.label}
          </NavLink>
        ))}
      </nav>

      <main className="flex-1 pb-[calc(4.25rem+env(safe-area-inset-bottom))] md:pb-0">
        <Outlet />
      </main>

      <nav
        className="fixed inset-x-0 bottom-0 z-20 border-t border-neutral-200 bg-white/95 backdrop-blur safe-bottom md:hidden"
        aria-label="Primary"
      >
        <div className="mx-auto flex max-w-lg items-stretch justify-between px-1">
          {TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              onClick={() => haptic('light')}
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center gap-1 py-2 text-[11px] font-medium tap-target ${
                  isActive ? 'text-brand-600' : 'text-neutral-400'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <tab.icon className="h-6 w-6" strokeWidth={isActive ? 2.5 : 2} aria-hidden />
                  {tab.label}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
