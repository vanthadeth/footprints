const STORAGE_KEY = 'footprints-language'
export type Language = 'en' | 'km'

export const LANGUAGES: { code: Language; label: string; nativeLabel: string }[] = [
  { code: 'en', label: 'English', nativeLabel: 'English' },
  { code: 'km', label: 'Khmer', nativeLabel: 'ខ្មែរ' },
]

export function getInitialLanguage(): Language {
  if (typeof window === 'undefined') return 'en'
  const stored = window.localStorage.getItem(STORAGE_KEY)
  return stored === 'km' ? 'km' : 'en'
}

/**
 * Persists the chosen language. This is a preference switch only -- it
 * does not translate the app's UI text. Full Khmer localization (wrapping
 * every string in the app and translating it) is a separate, much larger
 * follow-up; this just gives the setting somewhere to live and remembers
 * the choice across sessions.
 */
export function setLanguage(language: Language) {
  window.localStorage.setItem(STORAGE_KEY, language)
}
