import { createContext, useContext, useState, type ReactNode } from 'react'
import { getInitialLanguage, setLanguage as persistLanguage, type Language } from '@/lib/language'
import { en } from './en'
import { km } from './km'

const DICTIONARIES = { en, km }

interface LanguageContextValue {
  language: Language
  setLanguage: (language: Language) => void
  /** Looks up a dotted key (e.g. "home.checkInButton") and substitutes any {{var}} placeholders from `vars`. */
  t: (key: string, vars?: Record<string, string | number>) => string
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

  function setLanguage(next: Language) {
    persistLanguage(next)
    setLanguageState(next)
  }

  function t(key: string, vars?: Record<string, string | number>): string {
    const template = lookup(DICTIONARIES[language], key) ?? lookup(DICTIONARIES.en, key) ?? key
    if (!vars) return template
    return Object.entries(vars).reduce((acc, [name, value]) => acc.split(`{{${name}}}`).join(String(value)), template)
  }

  return <LanguageContext.Provider value={{ language, setLanguage, t }}>{children}</LanguageContext.Provider>
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useLanguage must be used within a LanguageProvider')
  return ctx
}
