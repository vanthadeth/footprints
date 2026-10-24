import { useEffect, useState } from 'react'
import { ChevronRight, CornerDownRight, ExternalLink, FileSpreadsheet } from 'lucide-react'
import { Notice } from '@/components/form'
import { cadenceText, listSources, sheetUrl, type Mapping, type Source } from './sources'

const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'never')

function Pill({ children, tone = 'neutral' }: { children: string; tone?: 'neutral' | 'brand' | 'warn' }) {
  const cls = tone === 'brand' ? 'bg-brand-50 text-brand-700' : tone === 'warn' ? 'bg-status-warn/10 text-status-warn' : 'bg-neutral-100 text-neutral-600'
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${cls}`}>{children}</span>
}

function MappingRow({ m, child }: { m: Mapping; child: boolean }) {
  return (
    <li className={child ? 'ml-6' : ''}>
      <details className="group rounded-xl border border-neutral-100 dark:border-neutral-800">
        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5">
          <ChevronRight className="h-4 w-4 shrink-0 text-neutral-400 transition-transform group-open:rotate-90" aria-hidden />
          {child && <CornerDownRight className="h-4 w-4 shrink-0 text-neutral-300" aria-hidden />}
          <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">{m.name}</span>
          <span className="text-neutral-400">→</span>
          <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs dark:bg-neutral-800">{m.targetTable}</code>
          <span className="ml-auto flex flex-wrap items-center gap-1.5">
            {child && <Pill>belongs to its customer row</Pill>}
            {m.handler && <Pill tone="brand">{`custom rules: ${m.handler === 'customers' ? 'customers' : 'sale orders'}`}</Pill>}
            <Pill tone={m.engine === 'footprints' ? 'brand' : 'neutral'}>{m.engine === 'footprints' ? 'Footprints engine' : 'Older runner'}</Pill>
            {!m.active && <Pill tone="warn">Off</Pill>}
            <span className="text-xs text-neutral-500">{m.columns.length} columns · {cadenceText(m)} · last run {date(m.lastRunAt)}</span>
          </span>
        </summary>
        <div className="border-t border-neutral-100 px-3 py-2 dark:border-neutral-800">
          {m.columns.length === 0 ? (
            <p className="py-1 text-xs text-neutral-500">{m.handler ? 'Columns for this mapping are handled by its custom rules.' : 'No columns mapped.'}</p>
          ) : (
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-neutral-500">
                  <th className="py-1 pr-3 font-bold">Sheet column</th>
                  <th className="py-1 pr-3 font-bold">Table column</th>
                  <th className="py-1 font-bold">How</th>
                </tr>
              </thead>
              <tbody>
                {m.columns.map((c, i) => (
                  <tr key={i} className="border-t border-neutral-50 dark:border-neutral-800">
                    <td className="py-1 pr-3">{c.sheetColumn}</td>
                    <td className="py-1 pr-3"><code>{c.targetColumn}</code></td>
                    <td className="py-1 text-neutral-500">
                      {[c.referenceTable ? `look up in ${c.referenceTable}` : null, c.transform && c.transform !== 'none' ? `${c.transform}${c.transformArg ? ` (${c.transformArg})` : ''}` : null].filter(Boolean).join(' · ') || c.valueKind}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </details>
    </li>
  )
}

function SourceCard({ s }: { s: Source }) {
  const tables = new Set(s.mappings.map((m) => m.targetTable)).size
  return (
    <section aria-label={s.name} className="rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <FileSpreadsheet className="mt-0.5 h-5 w-5 text-brand-500" aria-hidden />
          <div>
            <h3 className="text-base font-bold text-neutral-900 dark:text-neutral-50">Tab “{s.tabName}”</h3>
            <p className="text-xs text-neutral-500">
              {s.mappings.length} {s.mappings.length === 1 ? 'mapping' : 'mappings'} → {tables} {tables === 1 ? 'table' : 'tables'} · header row {s.headerRow}
            </p>
          </div>
        </div>
        <a href={sheetUrl(s.spreadsheetId)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-brand-500">
          Open sheet <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </a>
      </header>
      <ul className="mt-4 space-y-2">
        {s.mappings.map((m) => (
          <MappingRow key={m.id} m={m} child={!!m.parentId && s.mappings.some((p) => p.id === m.parentId)} />
        ))}
      </ul>
    </section>
  )
}

/** Read-only: each sheet tab and the tables it feeds, in the order a run applies them (parents before their children). */
export function SourcesTab() {
  const [sources, setSources] = useState<Source[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    listSources().then(setSources).catch((e) => setError(e instanceof Error ? e.message : 'Couldn’t load the sources.'))
  }, [])

  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-500">
        A source is one sheet tab. It can feed several tables: a run reads the tab once and applies each mapping in order, parents first. These are read-only for now, and every mapping still runs the way it did before.
      </p>
      {error && <Notice tone="error">{error}</Notice>}
      {!sources && !error && <div className="h-40 animate-pulse rounded-2xl bg-neutral-100" />}
      {sources?.map((s) => <SourceCard key={s.id} s={s} />)}
    </div>
  )
}
