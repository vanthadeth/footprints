import type { SourceSyncResult } from './sourceSyncService'

const n = (x: number) => x.toLocaleString('en-US')

/** What a preview or run did, per mapping, and the first problems found in the sheet. */
export function SyncResultView({ result }: { result: SourceSyncResult }) {
  const dry = result.dry
  return (
    <div className="space-y-2 rounded-xl border border-neutral-200 p-3 text-sm dark:border-neutral-800">
      <p className={`font-semibold ${result.ok ? 'text-status-working' : 'text-status-danger'}`}>
        {result.error ?? (result.ok ? (dry ? 'Preview: nothing was changed.' : 'Synced.') : 'Some mappings didn’t finish.')}
      </p>
      {result.results?.map((r) => (
        <p key={r.sync_id} className="text-neutral-700 dark:text-neutral-200">
          <span className="font-semibold">{r.name}</span> → <code className="text-xs">{r.table}</code>:{' '}
          {r.error ? (
            <span className="text-status-danger">{r.error}</span>
          ) : (
            <>
              {n(r.read)} rows · {dry ? 'would add' : 'added'} {n(r.inserted)} · {dry ? 'update' : 'updated'} {n(r.updated)} · {n(r.unchanged)} already up to date
              {r.skipped ? ` · skipped ${n(r.skipped)}` : ''}
            </>
          )}
        </p>
      ))}
      {!!result.errors?.length && (
        <details>
          <summary className="cursor-pointer text-xs font-bold text-neutral-500">
            {result.errors.length + (result.more_errors ?? 0)} {result.errors.length + (result.more_errors ?? 0) === 1 ? 'problem' : 'problems'} in the sheet
          </summary>
          <ul className="mt-1 max-h-40 list-disc space-y-0.5 overflow-y-auto pl-5 text-xs text-neutral-600">
            {result.errors.map((e, i) => (
              <li key={i}>{e.row ? `Row ${e.row}: ` : ''}{e.reason}</li>
            ))}
            {!!result.more_errors && <li>…and {result.more_errors} more</li>}
          </ul>
        </details>
      )}
    </div>
  )
}
