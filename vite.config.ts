import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'Footprints, by HIG',
        short_name: 'Footprints',
        description: 'Journal your sales journey.',
        // Matches the app's actual light-mode background (bg-neutral-50 in
        // index.css) so the OS-level chrome/splash screen blends into the
        // page instead of showing as a distinct colored strip/flash. (This
        // manifest value is a single static fallback -- the live in-app
        // status bar color still tracks the current theme via
        // src/lib/theme.ts and index.html.)
        theme_color: '#fafafa',
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
