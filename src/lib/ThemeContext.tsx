import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { applyTheme, getInitialTheme, type Theme } from './theme'

interface ThemeContextValue {
  theme: Theme
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

/**
 * Single shared theme instance for the whole app. Both the floating
 * ThemeToggle (top-right, every screen) and the Preferences switcher on
 * Profile read/write the same state through this -- two independent
 * useState(getInitialTheme()) copies would only agree until one of them
 * was actually used, since neither re-reads localStorage when the other
 * calls applyTheme.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => getInitialTheme())

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  const value: ThemeContextValue = {
    theme,
    setTheme: setThemeState,
    toggleTheme: () => setThemeState((t) => (t === 'dark' ? 'light' : 'dark')),
  }

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider')
  return ctx
}
