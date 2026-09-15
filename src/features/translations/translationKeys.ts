import { en } from '@/i18n/en'
import { km } from '@/i18n/km'

export interface TranslationKeyEntry {
  key: string
  namespace: string
  english: string
  khmerDefault: string
}

/** Flattens en.ts's nested dictionary into one row per key, pairing each with km.ts's default (guaranteed to exist -- see TranslationKey in src/i18n/en.ts). */
export function listTranslationKeys(): TranslationKeyEntry[] {
  const entries: TranslationKeyEntry[] = []
  for (const namespace of Object.keys(en) as (keyof typeof en)[]) {
    const enGroup = en[namespace]
    const kmGroup = km[namespace]
    for (const subKey of Object.keys(enGroup) as (keyof typeof enGroup)[]) {
      entries.push({
        key: `${namespace}.${String(subKey)}`,
        namespace,
        english: enGroup[subKey],
        khmerDefault: kmGroup[subKey],
      })
    }
  }
  return entries
}
