// Footprints: pushes the existing anomaly notifications (late clock-in,
// late clock-out, idling too long, ineffective visit) to every super
// admin's subscribed device over Web Push -- an additional channel
// alongside the in-app bell/Notifications page, which is unaffected by
// this function.
//
// Two modes, same as the doc comment on each handler below:
//   - Cron mode (service_role Bearer token, called every 5 minutes by the
//     attendance-manager-alerts-style pg_cron job in
//     0079_footprints_push_notifications_cron.sql): fans out every
//     not-yet-pushed notification to every active super admin's device.
//   - Self-test mode (a super admin's own JWT): sends one test push to just
//     that caller's own devices immediately, so they can verify their setup
//     without waiting for a real anomaly or the next cron tick.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3'

const KIND_LABELS: Record<string, string> = {
  late_clock_in: 'Late Clock-In',
  late_clock_out: 'Late Clock-Out',
  idling_too_long: 'Idling Too Long',
  ineffective_visit: 'Ineffective Visit',
}

interface PendingPushRow {
  notification_id: string
  endpoint: string
  p256dh: string
  auth: string
  kind: string
  message: string
}

interface PushSubscriptionRow {
  endpoint: string
  p256dh: string
  auth: string
}

Deno.serve(async (req) => {
  const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY')
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')
  const vapidSubject = Deno.env.get('VAPID_SUBJECT')
  if (!vapidPublicKey || !vapidPrivateKey || !vapidSubject) {
    return json({ error: 'VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT are not all set' }, 500)
  }
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const authHeader = req.headers.get('Authorization') ?? ''
  const isServiceRole = authHeader === `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`

  const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  if (isServiceRole) {
    return await runCronFanOut(admin)
  }
  return await runSelfTest(admin, supabaseUrl, authHeader)
})

/** Fans out every not-yet-pushed notification to every active super admin's device, then marks those notifications pushed. */
async function runCronFanOut(admin: ReturnType<typeof createClient>): Promise<Response> {
  const { data, error } = await admin.rpc('pending_push_notifications')
  if (error) return json({ error: error.message }, 500)

  const rows = (data ?? []) as PendingPushRow[]
  const notificationIds = new Set<string>()
  const results = await Promise.allSettled(
    rows.map(async (row) => {
      notificationIds.add(row.notification_id)
      await sendPush(admin, { endpoint: row.endpoint, p256dh: row.p256dh, auth: row.auth }, buildPayload(row.kind, row.message))
    })
  )
  const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
  if (failed.length > 0) console.error('push-notify-admins: some sends failed', failed.map((r) => String(r.reason)))

  if (notificationIds.size > 0) {
    const { error: markError } = await admin.rpc('mark_notifications_pushed', { p_ids: [...notificationIds] })
    if (markError) return json({ error: markError.message }, 500)
  }

  return json({ ok: failed.length === 0, sent: rows.length, notifications: notificationIds.size, failed: failed.length })
}

/** Sends one test push to just the calling super admin's own devices, using their own JWT (not service_role). */
async function runSelfTest(admin: ReturnType<typeof createClient>, supabaseUrl: string, authHeader: string): Promise<Response> {
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!anonKey) return json({ error: 'SUPABASE_ANON_KEY is not set' }, 500)

  const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } })
  const { data: userData, error: userError } = await caller.auth.getUser()
  if (userError || !userData.user) return json({ error: 'Not signed in' }, 401)

  const { data: profile, error: profileError } = await admin.from('users').select('is_super_admin').eq('id', userData.user.id).single()
  if (profileError || !profile?.is_super_admin) return json({ error: 'Only a super admin can send a test push' }, 403)

  const { data: subs, error: subsError } = await admin
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('user_id', userData.user.id)
  if (subsError) return json({ error: subsError.message }, 500)

  const subscriptions = (subs ?? []) as PushSubscriptionRow[]
  const results = await Promise.allSettled(
    subscriptions.map((sub) => sendPush(admin, sub, { title: 'Footprints', body: 'Test push -- if you can see this, it works.' }))
  )
  const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
  if (failed.length > 0) console.error('push-notify-admins: self-test send failed', failed.map((r) => String(r.reason)))

  return json({ ok: failed.length === 0, devices: subscriptions.length, failed: failed.length })
}

function buildPayload(kind: string, message: string): { title: string; body: string } {
  return { title: KIND_LABELS[kind] ?? 'Footprints', body: message }
}

async function sendPush(
  admin: ReturnType<typeof createClient>,
  subscription: PushSubscriptionRow,
  payload: { title: string; body: string }
): Promise<void> {
  try {
    await webpush.sendNotification(
      { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
      JSON.stringify({ ...payload, url: '/notifications' })
    )
  } catch (err) {
    // A 404/410 means the browser has unregistered this subscription (the
    // user revoked permission, cleared site data, etc.) -- prune it rather
    // than retrying it forever.
    const status = (err as { statusCode?: number }).statusCode
    if (status === 404 || status === 410) {
      await admin.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint)
      return
    }
    throw err
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
