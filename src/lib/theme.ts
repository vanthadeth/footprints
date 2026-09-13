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
 * 'class'` and the `.dark …` overrides in index.css key off), then
 * persists the choice so it survives a reload.
 *
 * The phone status bar is deliberately NOT touched here -- it's fixed to
 * a dark-gray/white-text look regardless of theme (the static theme-color
 * and apple-mobile-web-app-status-bar-style meta tags in index.html), so
 * there's nothing for a theme toggle to update.
 */
export function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  document.documentElement.style.colorScheme = theme
  window.localStorage.setItem(STORAGE_KEY, theme)
}
