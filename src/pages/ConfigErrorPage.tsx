import { AlertTriangle } from 'lucide-react'

/** Shown instead of a blank page when required env vars are missing -- see src/lib/supabase.ts. */
export function ConfigErrorPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-neutral-50 px-6 text-center safe-top safe-bottom">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-status-danger/10 text-status-danger">
        <AlertTriangle className="h-7 w-7" />
      </div>
      <div>
        <h1 className="text-lg font-semibold text-neutral-900">Footprints isn't configured yet</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-neutral-500">
          This deployment is missing <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs">VITE_SUPABASE_URL</code> and/or{' '}
          <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs">VITE_SUPABASE_ANON_KEY</code>. Set them in your hosting
          provider's environment variables and redeploy.
        </p>
      </div>
    </div>
  )
}
