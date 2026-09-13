import { Moon, Sun } from 'lucide-react'
import { useTheme } from '@/lib/ThemeContext'
import { haptic } from '@/lib/haptic'

/**
 * 'floating': fixed to the top-right corner of the viewport -- used on the
 * pre-auth screens (Welcome/Login/Forgot/Reset Password), which have no
 * title bar of their own. 'inline' sits in normal flow -- used inside
 * TitleBar for every authenticated screen, alongside the profile badge.
 */
export function ThemeToggle({ variant = 'floating' }: { variant?: 'floating' | 'inline' }) {
  const { theme, toggleTheme } = useTheme()

  return (
    <button
      onClick={() => {
        haptic('light')
        toggleTheme()
      }}
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      style={variant === 'floating' ? { top: 'calc(0.75rem + env(safe-area-inset-top))' } : undefined}
      className={
        variant === 'floating'
          ? 'fixed right-3 z-30 flex h-10 w-10 items-center justify-center rounded-full border border-neutral-200 bg-white/90 text-neutral-500 shadow-card backdrop-blur tap-target dark:border-neutral-700 dark:bg-neutral-900/90 dark:text-neutral-300'
          : 'flex h-9 w-9 items-center justify-center rounded-full text-neutral-500 tap-target dark:text-neutral-300'
      }
    >
      {/* key={theme} remounts the icon on toggle so animate-pop-in replays each time, giving a little crossfade instead of an instant swap. */}
      {theme === 'dark' ? <Sun key="sun" className="h-5 w-5 animate-pop-in" /> : <Moon key="moon" className="h-5 w-5 animate-pop-in" />}
    </button>
  )
}
