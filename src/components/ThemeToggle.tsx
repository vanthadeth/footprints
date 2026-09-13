import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { applyTheme, getInitialTheme, type Theme } from '@/lib/theme'
import { haptic } from '@/lib/haptic'

/**
 * Icon-only, fixed to the top-right corner of the viewport on every screen
 * (rendered once from App.tsx, not per-page) -- below the offline banner
 * (z-40) and bottom sheets (z-50) so it never fights either for attention.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => getInitialTheme())

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  return (
    <button
      onClick={() => {
        haptic('light')
        setTheme((t) => (t === 'dark' ? 'light' : 'dark'))
      }}
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      style={{ top: 'calc(0.75rem + env(safe-area-inset-top))' }}
      className="fixed right-3 z-30 flex h-10 w-10 items-center justify-center rounded-full border border-neutral-200 bg-white/90 text-neutral-500 shadow-card backdrop-blur tap-target dark:border-neutral-700 dark:bg-neutral-900/90 dark:text-neutral-300"
    >
      {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </button>
  )
}
