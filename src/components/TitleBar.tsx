import { useLocation } from 'react-router-dom'
import { LogoIcon } from '@/components/Logo'
import { ThemeToggle } from '@/components/ThemeToggle'
import { ProfileBadge } from '@/components/ProfileBadge'
import { useJourneyContext } from '@/features/attendance/JourneyContext'

const TITLES: Record<string, string> = {
  '/footprints': 'Footprints',
  '/fleet': 'Fleet',
  '/profile': 'Profile',
  '/menu': 'Menu',
}

/**
 * The one top bar for every authenticated screen (rendered once from
 * AppLayout, like the bottom nav/sidebar) -- replaces each page's own ad
 * hoc header (PageHeader, CheckInPage's greeting row, Footprints' hero
 * title) so the app has one consistent place for title + theme + account.
 */
export function TitleBar() {
  const { pathname } = useLocation()
  const { attendance } = useJourneyContext()
  const title = pathname === '/check-in' ? (attendance === 'CLOCKED_IN' ? 'Check In' : 'Clock In') : TITLES[pathname] ?? 'Footprints'

  return (
    <header className="sticky top-0 z-10 flex items-center justify-between border-b border-neutral-200 bg-white/95 px-4 py-3 backdrop-blur safe-top dark:border-neutral-800 md:px-8">
      <div className="flex items-center gap-2">
        <LogoIcon className="h-6 w-6" />
        <h1 className="text-base font-semibold text-neutral-900">{title}</h1>
      </div>
      <div className="flex items-center gap-1.5">
        <ThemeToggle variant="inline" />
        <ProfileBadge />
      </div>
    </header>
  )
}
