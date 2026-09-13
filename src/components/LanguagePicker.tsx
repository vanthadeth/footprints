import { useState } from 'react'
import { LANGUAGES, getInitialLanguage, setLanguage, type Language } from '@/lib/language'
import { haptic } from '@/lib/haptic'

/**
 * Shared by the Profile page's Preferences section and the profile-badge
 * dropdown's Language item, so the picker itself exists in one place.
 * Saves the choice (src/lib/language.ts) -- this doesn't translate the
 * app's UI text, which is called out here too so it isn't mistaken for
 * more finished than it is.
 */
export function LanguagePicker({ onSelect }: { onSelect?: (language: Language) => void }) {
  const [language, setLanguageState] = useState<Language>(() => getInitialLanguage())

  return (
    <div>
      <div className="grid grid-cols-2 gap-2">
        {LANGUAGES.map((l) => (
          <button
            key={l.code}
            onClick={() => {
              haptic('light')
              setLanguage(l.code)
              setLanguageState(l.code)
              onSelect?.(l.code)
            }}
            className={`rounded-lg border px-3 py-2 text-sm font-medium tap-target ${
              language === l.code ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-neutral-200 text-neutral-700'
            }`}
          >
            {l.nativeLabel}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-neutral-400">
        {language === 'km' ? 'ភាសាខ្មែរនឹងមកដល់ឆាប់ៗនេះ' : 'Full Khmer translation is coming soon -- this saves your preference for now.'}
      </p>
    </div>
  )
}
