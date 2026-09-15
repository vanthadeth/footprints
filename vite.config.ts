import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * Short commit hash for the build -- so "About" can show a build number
 * a user can read out over the phone to confirm they're on the deploy
 * you think they're on, without needing a bumped semver each time. Prefer
 * Vercel's own env var: its build runs from a checkout that may not carry
 * full git history, but VERCEL_GIT_COMMIT_SHA is always the exact commit
 * being deployed.
 */
function resolveBuildNumber(): string {
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7)
  try {
    return execSync('git rev-parse --short HEAD').toString().trim()
  } catch {
    return 'dev'
  }
}

// https://vite.dev/config/
export default defineConfig({
  define: {
    // JSON.stringify so these inline as string literals in the bundle, not
    // bare identifiers -- npm_package_version is set by npm for any
    // `npm run <script>` invocation, so it's present for both dev and build.
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.0.0'),
    __BUILD_NUMBER__: JSON.stringify(resolveBuildNumber()),
    // Evaluated once, when this config loads for the build -- a fixed
    // instant in time, not "now" re-evaluated on every page load.
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'Footprints, by HIG',
        short_name: 'Footprints',
        description: 'Journal your sales journey.',
        // Fixed brand-blue status bar/OS chrome, independent of the app's
        // own light/dark theme (see src/lib/theme.ts and index.html).
        theme_color: '#1668b8',
        // Splash screen while the app loads -- matches the light-mode page
        // background so it blends into first paint either way.
        background_color: '#fafafa',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // App-shell caching only. Live data (attendance, visits, customers)
        // is never cached here -- see src/lib/offline.ts for how writes are
        // queued instead of pretending a network write succeeded offline.
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        navigateFallbackDenylist: [/^\/rest\//, /^\/auth\//, /^\/storage\//, /^\/realtime\//],
        runtimeCaching: [
          {
            urlPattern: /\/storage\/v1\/object\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'footprints-media',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  server: {
    host: true,
  },
})
