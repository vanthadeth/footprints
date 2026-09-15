import { useEffect, useMemo, useState } from 'react'
import { Check, Loader2, Pencil, Search, ShieldAlert, X } from 'lucide-react'
import { useProfile } from '@/features/auth/useProfile'
import { useAuth } from '@/features/auth/AuthContext'
import { useLanguage } from '@/i18n/LanguageContext'
import { listTranslationKeys, type TranslationKeyEntry } from '@/features/translations/translationKeys'
import { translationOverridesService, type TranslationOverrideRow } from '@/features/translations/translationOverridesService'
import { haptic } from '@/lib/haptic'

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

function TranslationsList() {
  const { refreshOverrides } = useLanguage()
  const [rows, setRows] = useState<TranslationOverrideRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')

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

  const entries = useMemo(() => listTranslationKeys(), [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return entries
    return entries.filter(
      (e) => e.key.toLowerCase().includes(q) || e.english.toLowerCase().includes(q) || (overrideMap[e.key] ?? e.khmerDefault).includes(query.trim())
    )
  }, [entries, query, overrideMap])

  const grouped = useMemo(() => {
    const groups = new Map<string, TranslationKeyEntry[]>()
    for (const entry of filtered) {
      if (!groups.has(entry.namespace)) groups.set(entry.namespace, [])
      groups.get(entry.namespace)!.push(entry)
    }
    return groups
  }, [filtered])

  async function handleSaved() {
    await load()
    await refreshOverrides()
  }

  return (
    <div className="mx-auto max-w-lg pb-6 md:max-w-2xl">
      <div className="px-4 pt-4 md:px-8">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search strings…"
            className="w-full rounded-xl border border-neutral-200 bg-white py-2.5 pl-10 pr-3 text-sm text-neutral-900 placeholder:text-neutral-400"
          />
        </div>

        {error && <p className="mt-3 rounded-lg bg-status-danger/10 px-3 py-2 text-sm text-status-danger">{error}</p>}

        {loading ? (
          <div className="mt-4 space-y-2">
            <div className="h-16 animate-pulse rounded-xl2 bg-neutral-100" />
            <div className="h-16 animate-pulse rounded-xl2 bg-neutral-100" />
            <div className="h-16 animate-pulse rounded-xl2 bg-neutral-100" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="mt-8 text-center text-sm text-neutral-500">No strings match "{query}".</p>
        ) : (
          [...grouped.entries()].map(([namespace, items]) => (
            <div key={namespace} className="mt-4">
              <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-neutral-400">{namespace}</p>
              <div className="overflow-hidden rounded-xl2 bg-white shadow-card">
                {items.map((entry) => (
                  <TranslationRow
                    key={entry.key}
                    entry={entry}
                    currentValue={overrideMap[entry.key] ?? entry.khmerDefault}
                    isOverridden={entry.key in overrideMap}
                    onSaved={handleSaved}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function TranslationRow({
  entry,
  currentValue,
  isOverridden,
  onSaved,
}: {
  entry: TranslationKeyEntry
  currentValue: string
  isOverridden: boolean
  onSaved: () => Promise<void>
}) {
  const { session } = useAuth()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(currentValue)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function startEdit() {
    setValue(currentValue)
    setError(null)
    setEditing(true)
  }

  async function handleSave() {
    if (saving || !session) return
    setSaving(true)
    setError(null)
    try {
      await translationOverridesService.upsert(entry.key, 'km', value.trim(), session.user.id)
      haptic('success')
      await onSaved()
      setEditing(false)
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
    try {
      await translationOverridesService.remove(entry.key, 'km')
      haptic('success')
      await onSaved()
    } catch {
      haptic('error')
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <div className="border-t border-neutral-100 p-3.5 first:border-t-0 dark:border-neutral-800">
        <p className="text-xs text-neutral-400">{entry.english}</p>
        <div className="mt-1.5 flex items-start gap-2">
          <textarea
            autoFocus
            rows={2}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-sm text-neutral-900"
          />
          <button
            onClick={handleSave}
            disabled={saving}
            aria-label="Save"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-status-working/10 text-status-working tap-target disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          </button>
          <button
            onClick={() => setEditing(false)}
            disabled={saving}
            aria-label="Cancel"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-neutral-400 tap-target disabled:opacity-50"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        {error && <p className="mt-1.5 text-xs text-status-danger">{error}</p>}
      </div>
    )
  }

  return (
    <div className="flex items-start justify-between gap-2 border-t border-neutral-100 p-3.5 first:border-t-0 dark:border-neutral-800">
      <button onClick={startEdit} className="min-w-0 flex-1 text-left tap-target">
        <p className="truncate text-xs text-neutral-400">{entry.english}</p>
        <p className="mt-0.5 text-sm font-medium text-neutral-900">{currentValue}</p>
      </button>
      <div className="flex shrink-0 items-center gap-1">
        {isOverridden && (
          <button onClick={handleReset} disabled={saving} className="px-1 text-xs font-medium text-brand-600 tap-target disabled:opacity-50">
            Reset
          </button>
        )}
        <button onClick={startEdit} aria-label="Edit" className="flex h-7 w-7 items-center justify-center text-neutral-400 tap-target">
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
