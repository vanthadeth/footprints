import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { getInitialLanguage, setLanguage as persistLanguage, type Language } from '@/lib/language'
import { translationOverridesService } from '@/features/translations/translationOverridesService'
import { en } from './en'
import { km } from './km'

const DICTIONARIES = { en, km }

type Overrides = Record<Language, Record<string, string>>
const EMPTY_OVERRIDES: Overrides = { en: {}, km: {} }

interface LanguageContextValue {
  language: Language
  setLanguage: (language: Language) => void
  /** Looks up a dotted key (e.g. "home.checkInButton") and substitutes any {{var}} placeholders from `vars`. */
  t: (key: string, vars?: Record<string, string | number>) => string
  /** Re-fetches admin-entered overrides (src/pages/TranslationsPage.tsx) so a save/reset shows up immediately in this session. */
  refreshOverrides: () => Promise<void>
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

function lookup(dictionary: object, key: string): string | undefined {
  let node: unknown = dictionary
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined
    node = (node as Record<string, unknown>)[part]
  }
  return typeof node === 'string' ? node : undefined
}

/** Single shared language instance for the whole app -- same shape as ThemeProvider/useTheme. */
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => getInitialLanguage())
  const [overrides, setOverrides] = useState<Overrides>(EMPTY_OVERRIDES)

  // Keeps <html lang> correct after a live toggle -- index.html's inline
  // script only sets it correctly for the very first paint.
  useEffect(() => {
    document.documentElement.lang = language
  }, [language])

  async function refreshOverrides() {
    // Global config, not per-user -- a fetch-on-mount is enough (see
    // TranslationsPage.tsx for why this skips a realtime subscription).
    // Silently keeps whatever's already loaded on failure (e.g. offline)
    // rather than blanking out working translations.
    try {
      const rows = await translationOverridesService.list()
      const next: Overrides = { en: {}, km: {} }
      for (const row of rows) {
        if (row.language === 'en' || row.language === 'km') next[row.language][row.key] = row.value
      }
      setOverrides(next)
    } catch {
      // no-op -- see comment above
    }
  }

  useEffect(() => {
    void refreshOverrides()
  }, [])

  function setLanguage(next: Language) {
    persistLanguage(next)
    setLanguageState(next)
  }

  function t(key: string, vars?: Record<string, string | number>): string {
    const template = overrides[language][key] ?? lookup(DICTIONARIES[language], key) ?? lookup(DICTIONARIES.en, key) ?? key
    if (!vars) return template
    return Object.entries(vars).reduce((acc, [name, value]) => acc.split(`{{${name}}}`).join(String(value)), template)
  }

  return <LanguageContext.Provider value={{ language, setLanguage, t, refreshOverrides }}>{children}</LanguageContext.Provider>
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useLanguage must be used within a LanguageProvider')
  return ctx
}
