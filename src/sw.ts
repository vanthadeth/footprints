/// <reference lib="webworker" />
import type { PrecacheEntry } from 'workbox-precaching'

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<PrecacheEntry | string>
}

// Custom service worker (injectManifest strategy -- see vite.config.ts) so
// the push/notificationclick listeners below can exist at all; the default
// generateSW strategy auto-generates the whole worker with no room for
// custom event handlers. Everything above the push listener replicates the
// previous generateSW config exactly (app-shell precache only, live data
// under /rest //auth//storage//realtime never cached -- see
// src/lib/offline.ts for how writes are queued instead of pretending an
// offline write succeeded).
import { precacheAndRoute, createHandlerBoundToURL } from 'workbox-precaching'
import { registerRoute, NavigationRoute } from 'workbox-routing'
import { CacheFirst } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'

precacheAndRoute(self.__WB_MANIFEST)

registerRoute(
  new NavigationRoute(createHandlerBoundToURL('/index.html'), {
    denylist: [/^\/rest\//, /^\/auth\//, /^\/storage\//, /^\/realtime\//],
  })
)

registerRoute(
  /\/storage\/v1\/object\//,
  new CacheFirst({
    cacheName: 'footprints-media',
    plugins: [new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 7 })],
  })
)

self.skipWaiting()
self.addEventListener('activate', () => self.clients.claim())

// Push notifications (super admins only, see src/features/notifications/pushService.ts
// and supabase/functions/push-notify-admins) -- the payload is whatever
// push-notify-admins sent as the push message body.
interface PushPayload {
  title: string
  body: string
  url?: string
}

self.addEventListener('push', (event) => {
  let payload: PushPayload
  try {
    payload = event.data?.json() ?? { title: 'Footprints', body: '' }
  } catch {
    return
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: payload.url ?? '/notifications' },
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data?.url as string | undefined) ?? '/notifications'
  event.waitUntil(self.clients.openWindow(url))
})
