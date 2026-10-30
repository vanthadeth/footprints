import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Loader2, Pencil, Search, ShieldAlert, X } from 'lucide-react'
import { useProfile } from '@footprints/shared/features/auth/useProfile'
import { useAuth } from '@footprints/shared/features/auth/AuthContext'
import { useLanguage } from '@footprints/shared/i18n/LanguageContext'
import { listTranslationKeys, type TranslationKeyEntry } from '@/features/translations/translationKeys'
import { translationOverridesService, type TranslationOverrideRow } from '@footprints/shared/features/translations/translationOverridesService'
import { useVisitOptions } from '@/features/visits/useVisitOptions'
import type { VisitOptionKind } from '@/features/visits/visitOptionsService'
import { haptic } from '@footprints/shared/lib/haptic'
import { BottomSheet } from '@/components/BottomSheet'
import { filterEntries, missingPlaceholders, placeholdersOf, type TranslationFilter } from '@/features/translations/translationEdit'

const VISIT_OPTION_KIND_LABELS: Record<VisitOptionKind, string> = {
  visit_type: 'Visit Options — Type of Visit',
  visit_status: 'Visit Options — Visit Status',
  order_status: 'Visit Options — Order Status',
  payment_status: 'Visit Options — Payment Status',
}

/**
 * Super-admin screen: correct a Khmer string in place, no redeploy needed
 * -- the correction is stored in `translation_overrides` and picked up by
 * every session's LanguageContext. Self-guards on is_super_admin exactly
 * like LocationsPage/NotificationsPage, since this route is reachable by
 * URL regardless of nav visibility.
 *
 * English is shown read-only for reference only; only Khmer is editable
 * here, since that's the actual pain point (see km.ts's own "first draft"
 * note) -- not a general-purpose i18n editor.
 */
export function TranslationsPage() {
  const { profile, loading: profileLoading } = useProfile()

  if (profileLoading) {
    return (
      <div className="mx-auto max-w-lg space-y-2 p-4 md:max-w-2xl">
        <div className="h-16 animate-pulse rounded-xl2 bg-neutral-100" />
        <div className="h-16 animate-pulse rounded-xl2 bg-neutral-100" />
      </div>
    )
  }

  if (!profile?.is_super_admin) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center px-6 pt-16 text-center md:max-w-2xl">
        <ShieldAlert className="h-10 w-10 text-neutral-300" />
        <p className="mt-4 text-sm text-neutral-500">Only a super admin can edit translations.</p>
      </div>
    )
  }

  return <TranslationsList />
}

const FILTERS: { key: TranslationFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'edited', label: 'Edited' },
  { key: 'visit', label: 'Visit options' },
  { key: 'placeholders', label: 'Has placeholders' },
]

function TranslationsList() {
  const { refreshOverrides } = useLanguage()
  const { byKind } = useVisitOptions()
  const [rows, setRows] = useState<TranslationOverrideRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<TranslationFilter>('all')
  const [openKey, setOpenKey] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      setRows(await translationOverridesService.list())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load translations.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const overrideMap = useMemo(() => {
    const map: Record<string, string> = {}
    for (const row of rows) if (row.language === 'km') map[row.key] = row.value
    return map
  }, [rows])

  const staticEntries = useMemo(() => listTranslationKeys(), [])

  // Visit record values (visit_options.label -- Type of Visit/Visit
  // Status/Order Status/Payment Status) are admin-configured data, not
  // static dictionary keys, so they're translated as `visitOption:<id>`
  // overrides alongside everything else here rather than in en.ts/km.ts.
  const visitOptionEntries = useMemo(() => {
    const result: TranslationKeyEntry[] = []
    for (const kind of Object.keys(byKind) as VisitOptionKind[]) {
      for (const o of byKind[kind]) {
        result.push({ key: `visitOption:${o.id}`, namespace: VISIT_OPTION_KIND_LABELS[kind], english: o.label, khmerDefault: o.label })
      }
    }
    return result
  }, [byKind])

  const entries = useMemo(() => [...staticEntries, ...visitOptionEntries], [staticEntries, visitOptionEntries])
  const current = (e: TranslationKeyEntry) => overrideMap[e.key] ?? e.khmerDefault
  const isEdited = (e: TranslationKeyEntry) => e.key in overrideMap

  const filtered = useMemo(
    () => filterEntries(entries, filter, query, (e) => overrideMap[e.key] ?? e.khmerDefault, (e) => e.key in overrideMap),
    [entries, filter, query, overrideMap]
  )

  const grouped = useMemo(() => {
    const groups = new Map<string, TranslationKeyEntry[]>()
    for (const entry of filtered) {
      if (!groups.has(entry.namespace)) groups.set(entry.namespace, [])
      groups.get(entry.namespace)!.push(entry)
    }
    return groups
  }, [filtered])

  const editedCount = entries.filter(isEdited).length
  const opened = entries.find((e) => e.key === openKey) ?? null

  async function handleSaved() {
    await load()
    await refreshOverrides()
  }

  return (
    <div className="mx-auto max-w-lg pb-6 md:max-w-2xl">
      <div className="flex flex-col gap-3 px-4 pt-2 md:px-8 md:pt-4">
        <section aria-label="Progress" className="rounded-[20px] border border-neutral-100 bg-white p-4 shadow-card">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-[22px] font-extrabold leading-7 text-neutral-900">{editedCount} edited</p>
            <p className="text-[13px] text-neutral-500">of {entries.length.toLocaleString('en-US')} Khmer strings</p>
          </div>
          <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-neutral-100">
            <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.max(entries.length ? (editedCount / entries.length) * 100 : 0, editedCount ? 1.5 : 0)}%` }} />
          </div>
          <p className="mt-2.5 text-[12.5px] leading-[17px] text-neutral-500">English is the reference and can’t be changed here. A correction replaces the Khmer for everyone straight away, no update needed.</p>
        </section>

        <label className="flex h-11 items-center gap-2.5 rounded-[14px] border border-neutral-100 bg-white px-3.5 shadow-card">
          <Search className="h-[18px] w-[18px] shrink-0 text-neutral-500" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search strings…"
            aria-label="Search strings"
            className="min-w-0 flex-1 bg-transparent text-[15px] text-neutral-900 outline-none placeholder:text-neutral-500"
          />
        </label>

        <div role="radiogroup" aria-label="Show" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5 md:-mx-8 md:px-8">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              role="radio"
              aria-checked={filter === f.key}
              onClick={() => setFilter(f.key)}
              className={`h-[34px] shrink-0 whitespace-nowrap rounded-full border-[1.5px] px-3.5 text-[13px] ${filter === f.key ? 'border-brand-500 bg-brand-50 font-bold text-brand-700' : 'border-neutral-300 font-semibold text-neutral-900'}`}
            >
              {f.label}
              {f.key === 'edited' ? ` ${editedCount}` : ''}
            </button>
          ))}
        </div>

        {error && <p className="rounded-lg bg-status-danger/10 px-3 py-2 text-sm text-status-danger">{error}</p>}

        {loading ? (
          <div className="space-y-2">
            <div className="h-20 animate-pulse rounded-2xl bg-neutral-100" />
            <div className="h-20 animate-pulse rounded-2xl bg-neutral-100" />
            <div className="h-20 animate-pulse rounded-2xl bg-neutral-100" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-5 py-10 text-center text-sm text-neutral-500">
            <span className="flex h-14 w-14 items-center justify-center rounded-[18px] bg-neutral-100">
              <Search className="h-6 w-6" aria-hidden />
            </span>
            <p className="text-base font-bold text-neutral-900">{query.trim() ? `No strings match “${query.trim()}”` : 'Nothing here yet'}</p>
            <p>{query.trim() ? 'Try a word from the English text, the Khmer text or the key.' : 'Strings you edit will show up here.'}</p>
          </div>
        ) : (
          [...grouped.entries()].map(([namespace, items]) => (
            <section key={namespace} aria-label={namespace}>
              <p className="flex items-center justify-between px-1 pb-1.5 pt-2 text-xs font-bold uppercase tracking-[0.06em] text-neutral-500">
                {namespace}
                <span className="font-semibold normal-case tracking-normal">
                  {items.length} {items.length === 1 ? 'string' : 'strings'}
                </span>
              </p>
              <ul className="overflow-hidden rounded-[20px] border border-neutral-100 bg-white px-4 shadow-card">
                {items.map((entry) => (
                  <li key={entry.key} className="border-t border-neutral-100 first:border-t-0">
                    <button type="button" onClick={() => setOpenKey(entry.key)} className="flex w-full items-start gap-2.5 py-3.5 text-left">
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="text-[15px] font-bold leading-5 text-neutral-900">{entry.english}</span>
                        <code className="truncate font-mono text-[11.5px] text-neutral-500">{entry.key}</code>
                        <span className={`mt-1 rounded-[10px] px-2.5 py-2 text-[15px] leading-[22px] text-neutral-900 ${isEdited(entry) ? 'bg-brand-50' : 'bg-neutral-100'}`}>{current(entry)}</span>
                      </span>
                      <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center text-neutral-500">
                        <Pencil className="h-[18px] w-[18px]" aria-hidden />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>

      {opened && <EditSheet entry={opened} currentValue={current(opened)} isOverridden={isEdited(opened)} onClose={() => setOpenKey(null)} onSaved={handleSaved} />}
    </div>
  )
}

/** The edit sheet (canvas Translations · edit sheet): English for reference, the Khmer to correct, and a check that every {{slot}} is kept. */
function EditSheet({ entry, currentValue, isOverridden, onClose, onSaved }: { entry: TranslationKeyEntry; currentValue: string; isOverridden: boolean; onClose: () => void; onSaved: () => Promise<void> }) {
  const { session } = useAuth()
  const [value, setValue] = useState(currentValue)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const slots = placeholdersOf(entry.english)
  const missing = missingPlaceholders(entry.english, value)
  const empty = value.trim() === ''
  const unchanged = value.trim() === currentValue
  const canSave = !saving && !empty && missing.length === 0 && !unchanged && !!session

  async function handleSave() {
    if (!canSave || !session) return
    setSaving(true)
    setError(null)
    try {
      await translationOverridesService.upsert(entry.key, 'km', value.trim(), session.user.id)
      haptic('success')
      await onSaved()
      onClose()
    } catch (e) {
      haptic('error')
      setError(e instanceof Error ? e.message : 'Could not save this string.')
    } finally {
      setSaving(false)
    }
  }

  async function handleReset() {
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      await translationOverridesService.remove(entry.key, 'km')
      haptic('success')
      await onSaved()
      onClose()
    } catch (e) {
      haptic('error')
      setError(e instanceof Error ? e.message : 'Could not reset this string.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <BottomSheet
      open
      onClose={onClose}
      title="Edit translation"
      header={
        <div className="px-5 pb-1 pt-2.5">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-neutral-200" aria-hidden />
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-[22px] font-extrabold leading-7 text-neutral-900">Edit translation</h2>
              <code className="mt-0.5 block truncate font-mono text-xs text-neutral-500">{entry.key}</code>
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-900">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-3 px-5 pb-6 pt-2">
        <div>
          <p className="mb-1 text-xs font-bold uppercase tracking-[0.06em] text-neutral-500">English</p>
          <p className="rounded-xl bg-neutral-100 px-3 py-2.5 text-[15px] leading-[21px] text-neutral-900">{entry.english}</p>
        </div>
        <div>
          <label htmlFor="km-value" className="mb-1 block text-xs font-bold uppercase tracking-[0.06em] text-neutral-500">
            Khmer
          </label>
          <textarea
            id="km-value"
            autoFocus
            rows={3}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className={`w-full rounded-xl border-[1.5px] bg-white px-3 py-2.5 text-base leading-6 text-neutral-900 outline-none ${missing.length ? 'border-status-danger' : 'border-brand-500'}`}
          />
        </div>
        {slots.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-neutral-500">
            Keep these in the text:
            {slots.map((p) => {
              const ok = !missing.includes(p)
              return (
                <span key={p} className={`rounded-full px-2.5 py-0.5 font-mono text-[11px] font-bold ${ok ? 'bg-status-working/10 text-status-working' : 'bg-status-danger/10 text-status-danger'}`}>
                  {`{{${p}}}`}
                </span>
              )
            })}
          </div>
        )}
        {missing.length > 0 && (
          <div role="alert" className="flex gap-2 rounded-xl bg-status-danger/10 px-3 py-2.5 text-[13px] font-semibold leading-[18px] text-status-danger">
            <AlertTriangle className="mt-px h-[18px] w-[18px] shrink-0" aria-hidden />
            <span>{missing.map((p) => `{{${p}}}`).join(', ')} {missing.length === 1 ? 'is' : 'are'} missing. The app fills {missing.length === 1 ? 'it' : 'them'} in, so the sentence would read without {missing.length === 1 ? 'it' : 'them'}.</span>
          </div>
        )}
        {error && <p role="alert" className="text-xs font-semibold text-status-danger">{error}</p>}
        {isOverridden && (
          <button type="button" onClick={handleReset} disabled={saving} className="self-start py-1 text-[13.5px] font-bold text-brand-500 disabled:opacity-50">
            Reset to default
          </button>
        )}
        <div className="flex gap-2">
          <button type="button" onClick={onClose} disabled={saving} className="flex h-12 flex-1 items-center justify-center rounded-[14px] border-[1.5px] border-neutral-300 text-[15px] font-bold text-neutral-900 disabled:opacity-50">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className={`flex h-12 flex-1 items-center justify-center gap-2 rounded-[14px] text-[15px] font-bold ${canSave ? 'bg-brand-500 text-white' : 'bg-neutral-100 text-neutral-500'}`}
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Save
          </button>
        </div>
      </div>
    </BottomSheet>
  )
}
