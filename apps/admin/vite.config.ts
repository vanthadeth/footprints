import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// No PWA/service worker here: the admin app is desktop-first and online-only.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@footprints/shared': fileURLToPath(new URL('../../packages/shared/src', import.meta.url)),
    },
  },
  server: { host: true },
})
