import { useCallback, useEffect, useState } from 'react'
import { ChevronRight, CornerDownRight, ExternalLink, Eye, FileSpreadsheet, Loader2, RefreshCw } from 'lucide-react'
import { Notice, PrimaryButton, SecondaryButton } from '@/components/form'
import { MappingPanel } from './MappingPanel'
import { sourceSyncService, type SourceSyncResult } from './sourceSyncService'
import { SyncResultView } from './SyncResultView'
import { cadenceText, listSources, sheetUrl, type Mapping, type Source } from './sources'

const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'never')

function Pill({ children, tone = 'neutral' }: { children: string; tone?: 'neutral' | 'brand' | 'warn' }) {
  const cls = tone === 'brand' ? 'bg-brand-50 text-brand-700' : tone === 'warn' ? 'bg-status-warn/10 text-status-warn' : 'bg-neutral-100 text-neutral-600'
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${cls}`}>{children}</span>
}

function MappingRow({ m, child, onOpen }: { m: Mapping; child: boolean; onOpen: () => void }) {
  return (
    <li className={child ? 'ml-6' : ''}>
      <button type="button" onClick={onOpen} className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-neutral-100 px-3 py-2.5 text-left hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-800/50">
        {child && <CornerDownRight className="h-4 w-4 shrink-0 text-neutral-300" aria-hidden />}
        <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">{m.name}</span>
        <span className="text-neutral-400">→</span>
        <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs dark:bg-neutral-800">{m.targetTable}</code>
        <span className="ml-auto flex flex-wrap items-center gap-1.5">
          {child && <Pill>belongs to its customer row</Pill>}
          {m.handler && <Pill tone="brand">{`custom rules: ${m.handler === 'customers' ? 'customers' : 'sale orders'}`}</Pill>}
          <Pill tone={m.engine === 'footprints' ? 'brand' : 'neutral'}>{m.engine === 'footprints' ? 'Footprints engine' : 'Older runner'}</Pill>
          {!m.active && m.engine !== 'footprints' && <Pill tone="warn">Off</Pill>}
          <span className="text-xs text-neutral-500">{m.columns.length} columns · {cadenceText(m)} · last run {date(m.lastRunAt)}</span>
          <ChevronRight className="h-4 w-4 shrink-0 text-neutral-400" aria-hidden />
        </span>
      </button>
    </li>
  )
}

function SourceCard({ s, onOpen, onChanged }: { s: Source; onOpen: (m: Mapping) => void; onChanged: () => void }) {
  const tables = new Set(s.mappings.map((m) => m.targetTable)).size
  const moved = s.mappings.filter((m) => m.engine === 'footprints').length
  const [busy, setBusy] = useState<'preview' | 'run' | null>(null)
  const [result, setResult] = useState<SourceSyncResult | null>(null)
  async function go(kind: 'preview' | 'run') {
    setBusy(kind)
    try {
      setResult(await sourceSyncService.sync(kind, s.id))
      if (kind === 'run') onChanged()
    } catch (e) {
      setResult({ ok: false, error: e instanceof Error ? e.message : 'The sync didn’t finish.' })
    } finally {
      setBusy(null)
    }
  }
  return (
    <section aria-label={s.name} className="rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <FileSpreadsheet className="mt-0.5 h-5 w-5 text-brand-500" aria-hidden />
          <div>
            <h3 className="text-base font-bold text-neutral-900 dark:text-neutral-50">Tab “{s.tabName}”</h3>
            <p className="text-xs text-neutral-500">
              {s.mappings.length} {s.mappings.length === 1 ? 'mapping' : 'mappings'} → {tables} {tables === 1 ? 'table' : 'tables'} · header row {s.headerRow}
              {moved > 0 && ` · ${moved} on the Footprints engine`}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {moved > 0 && (
            <>
              <SecondaryButton disabled={!!busy} onClick={() => void go('preview')}>
                <span className="inline-flex items-center gap-1.5">{busy === 'preview' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" aria-hidden />}Preview all</span>
              </SecondaryButton>
              <PrimaryButton disabled={!!busy} onClick={() => void go('run')}>
                <span className="inline-flex items-center gap-1.5">{busy === 'run' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" aria-hidden />}Sync all</span>
              </PrimaryButton>
            </>
          )}
          <a href={sheetUrl(s.spreadsheetId)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-brand-500">
            Open sheet <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
        </div>
      </header>
      <ul className="mt-4 space-y-2">
        {s.mappings.map((m) => (
          <MappingRow key={m.id} m={m} child={!!m.parentId && s.mappings.some((p) => p.id === m.parentId)} onOpen={() => onOpen(m)} />
        ))}
      </ul>
      {result && <div className="mt-3"><SyncResultView result={result} /></div>}
    </section>
  )
}

/** Each sheet tab and the tables it feeds, in the order a run applies them (parents before their children). Open a mapping to edit its columns, preview it, or move it to the Footprints engine. */
export function SourcesTab() {
  const [sources, setSources] = useState<Source[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<{ sourceId: string; mappingId: string } | null>(null)
  const load = useCallback(() => {
    listSources().then(setSources).catch((e) => setError(e instanceof Error ? e.message : 'Couldn’t load the sources.'))
  }, [])
  useEffect(load, [load])

  const openSource = sources?.find((s) => s.id === open?.sourceId) ?? null
  const openMapping = openSource?.mappings.find((m) => m.id === open?.mappingId) ?? null

  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-500">
        A source is one sheet tab. It can feed several tables: a run reads the tab once and applies each mapping in order, parents first. Open a mapping to edit its columns or move it to the Footprints engine; everything else keeps running the way it did before.
      </p>
      {error && <Notice tone="error">{error}</Notice>}
      {!sources && !error && <div className="h-40 animate-pulse rounded-2xl bg-neutral-100" />}
      {sources?.map((s) => <SourceCard key={s.id} s={s} onOpen={(m) => setOpen({ sourceId: s.id, mappingId: m.id })} onChanged={load} />)}
      {openSource && <MappingPanel source={openSource} mapping={openMapping} onClose={() => setOpen(null)} onChanged={load} />}
    </div>
  )
}
