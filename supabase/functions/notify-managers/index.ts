// Footprints: pushes attendance alerts (late clock-in, late clock-out,
// idling too long) to the flagged user's chain of managers over LINE.
//
// Invoked every 5 minutes by the `attendance-manager-alerts` pg_cron job
// (see supabase/migrations/0074_footprints_manager_alerts_cron.sql), which
// authenticates with the project's service role key -- this function must
// never be reachable with anything less, since app.attendance_alerts()
// (called via the public.run_attendance_alerts() RPC below) writes
// notifications for arbitrary users and returns every chain manager's
// line_user_id.
//
// This is the first Edge Function checked into this repo -- there was no
// local `supabase/functions/*` template to copy (see this migration set's
// header comments), so it follows the standard Supabase Deno pattern.
import { createClient } from 'jsr:@supabase/supabase-js@2'

interface AttendanceAlertRow {
  line_user_id: string
  flagged_user_id: string
  kind: string
  message: string
}

const LINE_PUSH_URL = 'https://api.line.me/v2/bot/message/push'

Deno.serve(async () => {
  const lineToken = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN')
  if (!lineToken) {
    return json({ error: 'LINE_CHANNEL_ACCESS_TOKEN is not set' }, 500)
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const { data, error } = await supabase.rpc('run_attendance_alerts')
  if (error) {
    return json({ error: error.message }, 500)
  }

  const rows = (data ?? []) as AttendanceAlertRow[]

  // One LINE message per recipient, not per alert -- a manager with two
  // reports going late at once gets one push with two lines, not two pushes.
  const linesByRecipient = new Map<string, string[]>()
  for (const row of rows) {
    const lines = linesByRecipient.get(row.line_user_id) ?? []
    lines.push(row.message)
    linesByRecipient.set(row.line_user_id, lines)
  }

  const results = await Promise.allSettled(
    [...linesByRecipient.entries()].map(([lineUserId, lines]) => pushLineMessage(lineToken, lineUserId, lines.join('\n')))
  )
  const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
  if (failed.length > 0) {
    console.error('notify-managers: some LINE pushes failed', failed.map((r) => String(r.reason)))
  }

  return json({ ok: failed.length === 0, alerts: rows.length, recipients: linesByRecipient.size, failed: failed.length })
})

async function pushLineMessage(token: string, lineUserId: string, text: string): Promise<void> {
  const res = await fetch(LINE_PUSH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ to: lineUserId, messages: [{ type: 'text', text }] }),
  })
  if (!res.ok) {
    throw new Error(`LINE push to ${lineUserId} failed (${res.status}): ${await res.text()}`)
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
