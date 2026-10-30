import type { TranslationKeyEntry } from './translationKeys'

/** The {{name}} slots in a string, in order, without repeats. */
export function placeholdersOf(text: string): string[] {
  return [...new Set([...text.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]))]
}

/** Slots the English string has that the Khmer text dropped (they'd show as nothing, or as raw braces, in the app). */
export function missingPlaceholders(english: string, khmer: string): string[] {
  const have = new Set(placeholdersOf(khmer))
  return placeholdersOf(english).filter((p) => !have.has(p))
}

export type TranslationFilter = 'all' | 'edited' | 'visit' | 'placeholders'

export const VISIT_OPTION_PREFIX = 'visitOption:'

/** Which entries the filter chip and the search box let through. `current` is the Khmer text in use (override or default). */
export function filterEntries(entries: TranslationKeyEntry[], filter: TranslationFilter, query: string, current: (e: TranslationKeyEntry) => string, isEdited: (e: TranslationKeyEntry) => boolean): TranslationKeyEntry[] {
  const q = query.trim().toLowerCase()
  return entries.filter((e) => {
    if (filter === 'edited' && !isEdited(e)) return false
    if (filter === 'visit' && !e.key.startsWith(VISIT_OPTION_PREFIX)) return false
    if (filter === 'placeholders' && placeholdersOf(e.english).length === 0) return false
    if (!q) return true
    return e.key.toLowerCase().includes(q) || e.english.toLowerCase().includes(q) || current(e).toLowerCase().includes(q)
  })
}
