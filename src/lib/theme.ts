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

// Matches body's actual background in each theme (bg-neutral-50 / dark:
// bg-neutral-950 in index.css) so the status bar blends into the page
// instead of showing as a differently-colored strip above it.
const STATUS_BAR_COLOR: Record<Theme, string> = { light: '#fafafa', dark: '#0a0a0a' }

/**
 * Many Android/Chrome versions only re-read the `theme-color` meta tag
 * when it's inserted into the DOM, not when an existing tag's `content`
 * attribute is mutated -- a plain setAttribute() silently no-ops on the
 * actual status bar there. Removing the old tag and inserting a fresh one
 * forces every browser to notice.
 */
function setThemeColor(color: string) {
  document.querySelectorAll('meta[name="theme-color"]').forEach((el) => el.remove())
  const meta = document.createElement('meta')
  meta.setAttribute('name', 'theme-color')
  meta.setAttribute('content', color)
  document.head.appendChild(meta)
}

/**
 * Flips the `dark` class on <html> (what tailwind.config.js's `darkMode:
 * 'class'` and the `.dark …` overrides in index.css key off) and the
 * theme-color meta tag (so the phone's status bar/browser chrome matches
 * the app's actual background in each theme), then persists the choice so
 * it survives a reload.
 */
export function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  document.documentElement.style.colorScheme = theme
  setThemeColor(STATUS_BAR_COLOR[theme])
  // iOS home-screen installs read this at launch, not live, but keeping it
  // in sync means a relaunch after toggling picks up the right one instead
  // of a stale light/dark status bar style.
  document
    .querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')
    ?.setAttribute('content', theme === 'dark' ? 'black-translucent' : 'default')
  window.localStorage.setItem(STORAGE_KEY, theme)
}
