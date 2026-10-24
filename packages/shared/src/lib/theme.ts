const STORAGE_KEY = 'footprints-theme'

/** What the user picked. 'system' means "follow the OS setting, live". */
export type ThemeMode = 'system' | 'light' | 'dark'
/** What's actually painted -- there's no 'system' variant of this, it's always resolved to one of the two. */
export type AppliedTheme = 'light' | 'dark'

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches
}

/** Reads the persisted choice; a first-ever visit defaults to 'system' (not a light/dark guess) so it keeps tracking the OS setting until the user actually picks one. */
export function getInitialThemeMode(): ThemeMode {
  if (typeof window === 'undefined') return 'system'
  const stored = window.localStorage.getItem(STORAGE_KEY)
  if (stored === 'system' || stored === 'light' || stored === 'dark') return stored
  return 'system'
}

/** Resolves a mode to the theme that should actually be painted right now. */
export function resolveTheme(mode: ThemeMode): AppliedTheme {
  if (mode === 'system') return systemPrefersDark() ? 'dark' : 'light'
  return mode
}

/**
 * Flips the `dark` class on <html> (what tailwind.config.js's `darkMode:
 * 'class'` and the `.dark …` overrides in index.css key off), then
 * persists the chosen MODE (not the resolved theme -- 'system' needs to
 * survive a reload as 'system', not get frozen as whatever it resolved to
 * that one time) so it survives a reload.
 *
 * The phone status bar is deliberately NOT touched here -- it's fixed to
 * brand blue regardless of theme (the static theme-color meta tag in
 * index.html), so there's nothing for a theme toggle to update.
 */
export function applyTheme(mode: ThemeMode, applied: AppliedTheme) {
  document.documentElement.classList.toggle('dark', applied === 'dark')
  document.documentElement.style.colorScheme = applied
  window.localStorage.setItem(STORAGE_KEY, mode)
}
