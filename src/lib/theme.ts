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
 * theme-color is `#171717` (neutral-900, the same dark-gray card surface
 * used everywhere else) in both modes, matching the static default in
 * index.html -- kept as one value rather than switching to brand blue for
 * light mode, so the status bar doesn't change shade on every toggle.
 */
export function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  document.documentElement.style.colorScheme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#171717')
  // iOS home-screen installs read this at launch, not live, but keeping it
  // in sync means a relaunch after toggling picks up the right one instead
  // of a stale light/dark status bar style.
  document
    .querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')
    ?.setAttribute('content', theme === 'dark' ? 'black-translucent' : 'default')
  window.localStorage.setItem(STORAGE_KEY, theme)
}
