import { supabase } from '@/lib/supabase'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

export type PushPermissionState = 'unsupported' | 'default' | 'denied' | 'subscribed' | 'not-subscribed'

/**
 * An additional delivery channel for the same super-admin-only anomaly
 * notifications already shown in the in-app bell/Notifications page
 * (notificationsService.ts) -- this never creates or reads a notification
 * row itself, it only manages this device's Web Push subscription so
 * supabase/functions/push-notify-admins has somewhere to send to. See
 * supabase/migrations/0078_footprints_push_notifications.sql.
 */
export const pushService = {
  isSupported(): boolean {
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  },

  async getState(): Promise<PushPermissionState> {
    if (!this.isSupported()) return 'unsupported'
    if (Notification.permission === 'denied') return 'denied'
    if (Notification.permission === 'default') return 'default'

    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.getSubscription()
    return subscription ? 'subscribed' : 'not-subscribed'
  },

  /** Requests permission (if not already granted) and registers this device's subscription, both browser-side and in push_subscriptions. */
  async subscribe(): Promise<void> {
    if (!this.isSupported()) throw new Error('Push notifications are not supported on this device.')
    if (!VAPID_PUBLIC_KEY) throw new Error('VITE_VAPID_PUBLIC_KEY is not set.')

    const permission = await Notification.requestPermission()
    if (permission !== 'granted') throw new Error('Notification permission was not granted.')

    const registration = await navigator.serviceWorker.ready
    const subscription =
      (await registration.pushManager.getSubscription()) ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
      }))

    const json = subscription.toJSON()
    const { data: userData, error: userError } = await supabase.auth.getUser()
    if (userError || !userData.user) throw userError ?? new Error('Not signed in.')

    const { error } = await supabase.from('push_subscriptions').upsert(
      {
        user_id: userData.user.id,
        endpoint: subscription.endpoint,
        p256dh: json.keys?.p256dh ?? '',
        auth: json.keys?.auth ?? '',
      },
      { onConflict: 'endpoint' }
    )
    if (error) throw error
  },

  /** Unsubscribes this device, both browser-side and its push_subscriptions row. */
  async unsubscribe(): Promise<void> {
    if (!this.isSupported()) return
    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.getSubscription()
    if (!subscription) return

    await supabase.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint)
    await subscription.unsubscribe()
  },

  /** Shows a notification directly from this device, no server round-trip -- confirms the OS/browser will actually display one before relying on a real push. */
  async previewLocalNotification(): Promise<void> {
    if (!this.isSupported()) throw new Error('Push notifications are not supported on this device.')
    const registration = await navigator.serviceWorker.ready
    await registration.showNotification('Footprints', {
      body: 'This is what a push notification looks like on this device.',
      icon: '/icons/icon-192.png',
    })
  },

  /** Asks push-notify-admins to send a real push to every device this super admin has subscribed (self-test mode -- see the Edge Function's own doc comment). */
  async sendTestPush(): Promise<void> {
    const { data, error } = await supabase.functions.invoke('push-notify-admins')
    if (error) throw error
    if (data?.error) throw new Error(data.error)
  },
}

/** Web Push wants the VAPID public key as a raw Uint8Array, not the base64url string it's stored/configured as. */
function urlBase64ToUint8Array(base64url: string): Uint8Array {
  const padding = '='.repeat((4 - (base64url.length % 4)) % 4)
  const base64 = (base64url + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}
