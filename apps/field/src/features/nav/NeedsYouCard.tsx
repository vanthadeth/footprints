import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { useLanguage } from '@footprints/shared/i18n/LanguageContext'
import type { NeedLine } from './needsYou'

const TONE = { ok: 'bg-status-working/10 text-status-working', warn: 'bg-status-warn/10 text-status-warn', brand: 'bg-brand-50 text-brand-500 dark:bg-brand-500/15' } as const

/** The Hub's first card: what needs the person right now, each line opening its screen. Nothing shows when there is nothing real to say. */
export function NeedsYouCard({ title, lines }: { title: string; lines: NeedLine[] }) {
  const { t } = useLanguage()
  return (
    <section aria-label={title} className="rounded-2xl border border-neutral-100 bg-white p-4 shadow-card">
      <h2 className="mb-2 text-[15px] font-bold text-neutral-900">{title}</h2>
      {lines.length === 0 ? (
        <p className="py-2 text-[13px] text-neutral-500">{t('hubNeeds.allClear')}</p>
      ) : (
        lines.map((l, i) => (
          <Link key={l.key} to={l.to} className={`flex items-center gap-3 py-2.5 ${i ? 'border-t border-neutral-100 dark:border-neutral-800' : ''}`}>
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${TONE[l.tone]}`}>
              <l.icon className="h-[18px] w-[18px]" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14.5px] font-bold text-neutral-900">{l.title}</span>
              <span className="block truncate text-xs text-neutral-500">{l.sub}</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-neutral-400" aria-hidden />
          </Link>
        ))
      )}
    </section>
  )
}
