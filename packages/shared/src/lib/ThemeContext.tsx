import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { applyTheme, getInitialThemeMode, resolveTheme, type AppliedTheme, type ThemeMode } from './theme'

interface ThemeContextValue {
  /** What the user picked -- 'system' | 'light' | 'dark'. Drives the 3-way Appearance control in Settings. */
  mode: ThemeMode
  setMode: (mode: ThemeMode) => void
  /** What's actually painted right now -- 'system' already resolved. Used by the handful of pre-shell screens that only need a binary toggle. */
  theme: AppliedTheme
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

/**
 * Single shared theme instance for the whole app -- one designated control
 * (Settings → Appearance) rather than a toggle scattered across every
 * screen. A `matchMedia` listener keeps 'system' mode live: if the user
 * never explicitly picked light/dark, flipping the OS setting should flip
 * the app without needing a reload.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(() => getInitialThemeMode())
  const [applied, setApplied] = useState<AppliedTheme>(() => resolveTheme(mode))

  useEffect(() => {
    const next = resolveTheme(mode)
    setApplied(next)
    applyTheme(mode, next)

    if (mode !== 'system' || typeof window === 'undefined') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      const resolved = resolveTheme('system')
      setApplied(resolved)
      applyTheme('system', resolved)
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [mode])

  const value: ThemeContextValue = {
    mode,
    setMode,
    theme: applied,
    // Only used by pre-shell screens with no Settings access
    // (ConfigErrorPage) -- flips to an explicit choice rather than
    // silently no-op'ing if the user is currently on 'system'.
    toggleTheme: () => setMode(applied === 'dark' ? 'light' : 'dark'),
  }

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider')
  return ctx
}
