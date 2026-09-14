import { Moon, Sun } from 'lucide-react'
import { useTheme } from '@/lib/ThemeContext'
import { haptic } from '@/lib/haptic'

/**
 * A floating light/dark toggle for the couple of screens that render
 * before the app shell exists (ConfigErrorPage, ForceChangePasswordPage)
 * and so have no Settings screen to point at. Everywhere else, Appearance
 * (with a proper System/Light/Dark choice) lives in Settings -- see
 * AppearanceControl -- rather than a toggle repeated on every screen.
 */
export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()

  return (
    <button
      onClick={() => {
        haptic('light')
        toggleTheme()
      }}
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      style={{ top: 'calc(0.75rem + env(safe-area-inset-top))' }}
      className="fixed right-3 z-30 flex h-10 w-10 items-center justify-center rounded-full border border-neutral-200 bg-white/90 text-neutral-500 shadow-card backdrop-blur tap-target dark:border-neutral-700 dark:bg-neutral-900/90 dark:text-neutral-300"
    >
      {/* key={theme} remounts the icon on toggle so animate-pop-in replays each time, giving a little crossfade instead of an instant swap. */}
      {theme === 'dark' ? <Sun key="sun" className="h-5 w-5 animate-pop-in" /> : <Moon key="moon" className="h-5 w-5 animate-pop-in" />}
    </button>
  )
}
