const STORAGE_KEY = 'footprints-theme'
export type Theme = 'light' | 'dark'

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches
}

/** Reads the persisted choice, falling back to the OS setting on first visit. */
export function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'light'
  const stored = window.localStorage.getItem(STORAGE_KEY)
  if (stored === 'light' || stored === 'dark') return stored
  return systemPrefersDark() ? 'dark' : 'light'
}

/**
 * Flips the `dark` class on <html> (what tailwind.config.js's `darkMode:
 * 'class'` and the `.dark …` overrides in index.css key off) and the
 * theme-color meta tag (so the browser/PWA chrome matches), then persists
 * the choice so it survives a reload.
 */
export function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  document.documentElement.style.colorScheme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#041c30' : '#1668b8')
  window.localStorage.setItem(STORAGE_KEY, theme)
}
