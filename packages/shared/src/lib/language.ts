const STORAGE_KEY = 'footprints-language'
export type Language = 'en' | 'km'

export const LANGUAGES: { code: Language; label: string; nativeLabel: string }[] = [
  { code: 'km', label: 'Khmer', nativeLabel: 'ខ្មែរ' },
  { code: 'en', label: 'English', nativeLabel: 'English' },
]

/** Khmer is the app's default -- only an explicit "en" in storage opts back out of it. */
export function getInitialLanguage(): Language {
  if (typeof window === 'undefined') return 'km'
  const stored = window.localStorage.getItem(STORAGE_KEY)
  return stored === 'en' ? 'en' : 'km'
}

/** Persists the chosen language -- see src/i18n/LanguageContext.tsx for where it's actually applied to the UI. */
export function setLanguage(language: Language) {
  window.localStorage.setItem(STORAGE_KEY, language)
}
