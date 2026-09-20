// Footprints: pushes attendance alerts (late clock-in, late clock-out,
// idling too long) to the flagged user's chain of managers over Telegram.
//
// Invoked every 5 minutes by the `attendance-manager-alerts` pg_cron job
// (see supabase/migrations/0074_footprints_manager_alerts_cron.sql), which
// authenticates with the project's service role key -- this function must
// never be reachable with anything less, since app.attendance_alerts()
// (called via the public.run_attendance_alerts() RPC below) writes
// notifications for arbitrary users and returns every chain manager's
// telegram_id.
//
// This is the first Edge Function checked into this repo -- there was no
// local `supabase/functions/*` template to copy (see this migration set's
// header comments), so it follows the standard Supabase Deno pattern.
import { createClient } from 'jsr:@supabase/supabase-js@2'

interface AttendanceAlertRow {
  telegram_id: string
  flagged_user_id: string
  kind: string
  message: string
}

Deno.serve(async () => {
  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN')
  if (!botToken) {
    return json({ error: 'TELEGRAM_BOT_TOKEN is not set' }, 500)
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const { data, error } = await supabase.rpc('run_attendance_alerts')
  if (error) {
    return json({ error: error.message }, 500)
  }

  const rows = (data ?? []) as AttendanceAlertRow[]

  // One Telegram message per recipient, not per alert -- a manager with two
  // reports going late at once gets one message with two lines, not two.
  const linesByRecipient = new Map<string, string[]>()
  for (const row of rows) {
    const lines = linesByRecipient.get(row.telegram_id) ?? []
    lines.push(row.message)
    linesByRecipient.set(row.telegram_id, lines)
  }

  const results = await Promise.allSettled(
    [...linesByRecipient.entries()].map(([chatId, lines]) => sendTelegramMessage(botToken, chatId, lines.join('\n')))
  )
  const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
  if (failed.length > 0) {
    console.error('notify-managers: some Telegram sends failed', failed.map((r) => String(r.reason)))
  }

  return json({ ok: failed.length === 0, alerts: rows.length, recipients: linesByRecipient.size, failed: failed.length })
})

async function sendTelegramMessage(botToken: string, chatId: string, text: string): Promise<void> {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  })
  if (!res.ok) {
    throw new Error(`Telegram send to ${chatId} failed (${res.status}): ${await res.text()}`)
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
