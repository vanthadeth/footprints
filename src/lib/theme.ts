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
 * theme-color meta tag (so the phone's status bar/browser chrome matches),
 * then persists the choice so it survives a reload.
 *
 * Dark mode's theme-color is `#171717` (neutral-900, the same dark-gray
 * card surface used everywhere else) rather than the brand-900 navy used
 * for hero cards -- the status bar sits above the page background, which
 * is dark gray/near-black, not navy, so a navy bar looked like a mismatched
 * seam at the top of the screen.
 */
export function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  document.documentElement.style.colorScheme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#171717' : '#1668b8')
  // iOS home-screen installs read this at launch, not live, but keeping it
  // in sync means a relaunch after toggling picks up the right one instead
  // of a stale light/dark status bar style.
  document
    .querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')
    ?.setAttribute('content', theme === 'dark' ? 'black-translucent' : 'default')
  window.localStorage.setItem(STORAGE_KEY, theme)
}
