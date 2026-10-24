import { useEffect, useMemo, useState } from 'react'
import { Eye, Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { SidePanel } from '@footprints/shared/components/desktop/SidePanel'
import { planProblem, type ColumnMap as EngineColumn, type MappingPlan } from '../../../../../supabase/functions/sheet-sync/engine'
import { Notice, PrimaryButton, SecondaryButton, Select, TextInput } from '@/components/form'
import { diffColumns, draftProblem, toDraft, type DraftColumn } from './columnMapDiff'
import { sourceSyncService, type SourceSyncResult } from './sourceSyncService'
import { SyncResultView } from './SyncResultView'
import type { Mapping, Source } from './sources'

const KINDS = ['text', 'number', 'integer', 'boolean', 'date', 'timestamp']
const RULES: [string, string][] = [
  ['none', 'As it is'],
  ['fallback', 'If empty, use…'],
  ['suffix', 'Add to the end…'],
  ['latitude', 'Latitude of a map pin'],
  ['longitude', 'Longitude of a map pin'],
]
const SUPPORTED = new Set(RULES.map(([v]) => v))

let nextKey = 0
const blank = (): DraftColumn => ({ key: `new-${nextKey++}`, id: null, sheetColumn: '', targetColumn: null, valueKind: 'text', transform: 'none', transformArg: null, referenceTable: null })

/** The mapping as the engine reads it (from the saved column maps, which is what Preview, Sync and Move use). */
function planOf(m: Mapping, keyColumn: string): MappingPlan {
  return {
    name: m.name,
    targetTable: m.targetTable,
    keyColumn,
    requireColumn: m.requireColumn,
    columns: m.columns.map((c): EngineColumn => ({ sheetColumn: c.sheetColumn, targetColumn: c.targetColumn || null, valueKind: c.valueKind as EngineColumn['valueKind'], transform: (c.transform ?? 'none') as EngineColumn['transform'], transformArg: c.transformArg, referenceTable: c.referenceTable })),
  }
}

export function MappingPanel({ source, mapping, onClose, onChanged }: { source: Source; mapping: Mapping | null; onClose: () => void; onChanged: () => void }) {
  const [draft, setDraft] = useState<DraftColumn[]>([])
  const [allowed, setAllowed] = useState<{ name: string; type: string }[]>([])
  const [targets, setTargets] = useState<{ table: string; label: string; keyColumn: string }[]>([])
  const [busy, setBusy] = useState<'preview' | 'run' | 'switch' | 'save' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [result, setResult] = useState<SourceSyncResult | null>(null)

  useEffect(() => {
    if (!mapping) return
    setDraft(mapping.columns.map(toDraft))
    setError(null)
    setSaved(false)
    setResult(null)
    setAllowed([])
    let cancelled = false
    sourceSyncService.allowedColumns(mapping.targetTable).then((c) => !cancelled && setAllowed(c)).catch((e) => !cancelled && setError(e instanceof Error ? e.message : 'Couldn’t load the table’s columns.'))
    sourceSyncService.targets().then((t) => !cancelled && setTargets(t)).catch(() => {})
    return () => {
      cancelled = true
    }
  }, [mapping])

  const keyColumn = mapping ? (mapping.matchOn === 'sheet_id' ? 'sheet_id' : (targets.find((t) => t.table === mapping.targetTable)?.keyColumn ?? 'sheet_id')) : 'sheet_id'
  const plan = useMemo(() => (mapping ? planOf(mapping, keyColumn) : null), [mapping, keyColumn])
  const blocker = mapping && plan ? (mapping.parentId ? 'Mappings that belong to a parent row (like contacts) can’t move yet.' : mapping.handler ? 'This one has its own custom rules and stays where it is for now.' : planProblem(plan)) : null
  const dirty = mapping ? (() => { const d = diffColumns(mapping.columns, draft); return d.deletes.length + d.updates.length + d.inserts.length > 0 })() : false
  const problem = draftProblem(draft)
  const onFootprints = mapping?.engine === 'footprints'

  const setRow = (key: string, patch: Partial<DraftColumn>) => setDraft((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)))

  async function run<T>(kind: NonNullable<typeof busy>, action: () => Promise<T>, after?: (v: T) => void) {
    setBusy(kind)
    setError(null)
    try {
      after?.(await action())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setBusy(null)
    }
  }

  if (!mapping) return <SidePanel open={false} onClose={onClose} title="Mapping">{null}</SidePanel>

  return (
    <SidePanel open onClose={onClose} title={mapping.name} width="max-w-5xl">
      <div className="space-y-6 p-6">
        <p className="text-sm text-neutral-500">
          Tab “{source.tabName}” → <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs dark:bg-neutral-800">{mapping.targetTable}</code> · rows are matched on <code className="text-xs">{keyColumn}</code>
        </p>
        {error && <Notice tone="error">{error}</Notice>}

        <section className="space-y-3 rounded-2xl border border-neutral-200 p-4 dark:border-neutral-800">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-neutral-900 dark:text-neutral-50">{onFootprints ? 'Runs on the Footprints engine' : 'Runs on the older runner'}</p>
              <p className="text-xs text-neutral-500">
                {onFootprints
                  ? 'Empty cells never erase what’s in the table. Handing it back turns the older runner on for it again.'
                  : blocker
                    ? blocker
                    : 'Ready to move. The older runner is told to skip it; empty cells then never erase what’s in the table.'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {onFootprints ? (
                <>
                  <SecondaryButton disabled={!!busy || dirty} onClick={() => run('preview', () => sourceSyncService.sync('preview', source.id, mapping.id), setResult)}>
                    <span className="inline-flex items-center gap-1.5">{busy === 'preview' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" aria-hidden />}Preview changes</span>
                  </SecondaryButton>
                  <PrimaryButton disabled={!!busy || dirty} onClick={() => run('run', () => sourceSyncService.sync('run', source.id, mapping.id), (r) => { setResult(r); onChanged() })}>
                    <span className="inline-flex items-center gap-1.5">{busy === 'run' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" aria-hidden />}Sync now</span>
                  </PrimaryButton>
                  <SecondaryButton
                    disabled={!!busy}
                    onClick={() => {
                      if (!window.confirm(`Hand “${mapping.name}” back to the older runner? Footprints will stop syncing it.`)) return
                      void run('switch', () => sourceSyncService.switchEngine(mapping.id, 'legacy'), (r) => (r.ok ? onChanged() : setError(r.error ?? 'Couldn’t hand it back.')))
                    }}
                  >
                    Hand back
                  </SecondaryButton>
                </>
              ) : (
                <PrimaryButton
                  disabled={!!busy || !!blocker || dirty}
                  onClick={() => {
                    if (!window.confirm(`Move “${mapping.name}” to the Footprints engine? The older runner will skip it from now on, so make sure nothing else is meant to run it.`)) return
                    void run('switch', () => sourceSyncService.switchEngine(mapping.id, 'footprints'), (r) => (r.ok ? onChanged() : setError(r.error ?? 'Couldn’t move it.')))
                  }}
                >
                  {busy === 'switch' ? 'Moving…' : 'Move to Footprints engine'}
                </PrimaryButton>
              )}
            </div>
          </div>
          {dirty && <p className="text-xs text-status-warn">Save your column changes first; Preview, Sync and Move use the saved columns.</p>}
          {result && <SyncResultView result={result} />}
        </section>

        <section className="space-y-3">
          <div>
            <h3 className="text-[11px] font-extrabold uppercase tracking-[0.05em] text-neutral-500">Columns</h3>
            <p className="text-xs text-neutral-500">Each row reads one sheet column into one table column. Set a row to “Ignore” to leave a sheet column out. The older runner reads these too.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[56rem] text-left text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-neutral-500">
                  {['Sheet column', 'Table column', 'Type', 'Rule', 'Text', 'Look up in', ''].map((h) => (
                    <th key={h} className="pb-1.5 pr-2 font-bold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {draft.map((r) => (
                  <tr key={r.key} className="border-t border-neutral-100 align-top dark:border-neutral-800">
                    <td className="py-1.5 pr-2"><TextInput value={r.sheetColumn} onChange={(v) => setRow(r.key, { sheetColumn: v })} /></td>
                    <td className="py-1.5 pr-2">
                      <Select value={r.targetColumn ?? ''} onChange={(v) => setRow(r.key, { targetColumn: v || null })}>
                        <option value="">Ignore</option>
                        {r.targetColumn && !allowed.some((a) => a.name === r.targetColumn) && <option value={r.targetColumn}>{r.targetColumn}</option>}
                        {allowed.map((a) => <option key={a.name} value={a.name}>{a.name}</option>)}
                      </Select>
                    </td>
                    <td className="py-1.5 pr-2"><Select value={r.valueKind} onChange={(v) => setRow(r.key, { valueKind: v })}>{KINDS.map((k) => <option key={k} value={k}>{k}</option>)}</Select></td>
                    <td className="py-1.5 pr-2">
                      <Select value={r.transform} onChange={(v) => setRow(r.key, { transform: v })}>
                        {!SUPPORTED.has(r.transform) && <option value={r.transform}>{r.transform} (older runner only)</option>}
                        {RULES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </Select>
                    </td>
                    <td className="py-1.5 pr-2">{r.transform === 'fallback' || r.transform === 'suffix' ? <TextInput value={r.transformArg ?? ''} onChange={(v) => setRow(r.key, { transformArg: v })} /> : null}</td>
                    <td className="py-1.5 pr-2">
                      <Select value={r.referenceTable ?? ''} onChange={(v) => setRow(r.key, { referenceTable: v || null })}>
                        <option value="">—</option>
                        {targets.map((t) => <option key={t.table} value={t.table}>{t.label}</option>)}
                      </Select>
                    </td>
                    <td className="py-1.5">
                      <button type="button" aria-label={`Remove ${r.sheetColumn || 'row'}`} onClick={() => setDraft((rows) => rows.filter((x) => x.key !== r.key))} className="rounded-lg p-2 text-neutral-400 hover:bg-neutral-100 hover:text-status-danger">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SecondaryButton onClick={() => setDraft((rows) => [...rows, blank()])}><span className="inline-flex items-center gap-1.5"><Plus className="h-4 w-4" />Add a column</span></SecondaryButton>
            <div className="flex items-center gap-3">
              {problem && dirty && <span className="text-xs text-status-warn">{problem}</span>}
              {saved && !dirty && <span className="text-xs text-status-working">Saved.</span>}
              <SecondaryButton disabled={!dirty || !!busy} onClick={() => { setDraft(mapping.columns.map(toDraft)); setSaved(false) }}>Discard</SecondaryButton>
              <PrimaryButton
                disabled={!dirty || !!problem || !!busy}
                onClick={() => run('save', () => sourceSyncService.saveColumns(mapping.id, mapping.columns, draft), () => { setSaved(true); onChanged() })}
              >
                {busy === 'save' ? 'Saving…' : 'Save columns'}
              </PrimaryButton>
            </div>
          </div>
        </section>
      </div>
    </SidePanel>
  )
}
