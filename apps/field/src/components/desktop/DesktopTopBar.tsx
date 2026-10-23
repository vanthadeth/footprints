import { Moon, Sun } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { NotificationBell } from '@/components/NotificationBell'
import { ProfileBadge } from '@/components/ProfileBadge'
import { useScreenTitle } from '@/components/TitleBar'
import { useLanguage } from '@footprints/shared/i18n/LanguageContext'
import { useTheme } from '@footprints/shared/lib/ThemeContext'

/** The desktop top bar: the screen's title and today's date on the left, notifications, theme and the profile on the right. */
export function DesktopTopBar() {
  const title = useScreenTitle()
  const { language } = useLanguage()
  const { pathname } = useLocation()
  const { theme, toggleTheme } = useTheme()
  const today = new Date().toLocaleDateString(language === 'km' ? 'km-KH' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center justify-between gap-4 border-b border-neutral-200 bg-white/95 px-8 backdrop-blur dark:border-neutral-800">
      <div className="min-w-0">
        <h1 key={pathname} className="truncate text-xl font-extrabold leading-6 tracking-[-0.01em] text-neutral-900">
          {title}
        </h1>
        <p className="text-xs font-medium text-neutral-500">{today}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-neutral-200 text-neutral-500 hover:bg-neutral-100 dark:border-neutral-700"
        >
          {theme === 'dark' ? <Sun className="h-[18px] w-[18px]" aria-hidden /> : <Moon className="h-[18px] w-[18px]" aria-hidden />}
        </button>
        <NotificationBell framed />
        <ProfileBadge />
      </div>
    </header>
  )
}
