import { formatDate, formatTime } from '@/lib/datetime'

/**
 * Version/build/timestamp trio for the About sheet -- lets someone confirm
 * they're actually on the deploy you think they are, rather than a stale
 * cached PWA shell (registerType: 'autoUpdate' still means "eventually",
 * not "instantly"). Values come from vite.config.ts's `define`, baked in
 * at build time -- see src/vite-env.d.ts for the ambient declarations.
 */
export function AppBuildInfo() {
  return (
    <dl className="mt-2 space-y-0.5 text-xs text-neutral-400">
      <div className="flex justify-between gap-3">
        <dt>Version</dt>
        <dd className="font-medium text-neutral-500">{__APP_VERSION__}</dd>
      </div>
      <div className="flex justify-between gap-3">
        <dt>Build</dt>
        <dd className="font-medium text-neutral-500">{__BUILD_NUMBER__}</dd>
      </div>
      <div className="flex justify-between gap-3">
        <dt>Built</dt>
        <dd className="font-medium text-neutral-500">
          {formatDate(__BUILD_TIME__)} {formatTime(__BUILD_TIME__)}
        </dd>
      </div>
    </dl>
  )
}
