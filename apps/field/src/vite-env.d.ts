/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_MAP_PROVIDER?: string
  readonly VITE_MAP_API_KEY?: string
  /** Address of the separate admin app (no trailing slash). Shows the Survey setup row when set. */
  readonly VITE_ADMIN_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/** Injected by vite.config.ts's `define` -- see AppBuildInfo. */
declare const __APP_VERSION__: string
declare const __BUILD_NUMBER__: string
declare const __BUILD_TIME__: string
