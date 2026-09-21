// Footprints: Telegram webhook target -- lets anyone message the bot with
// "get my id" (or /getid) and get back their own numeric Telegram user ID
// and this chat's ID, so a super admin can self-serve the value
// app.set_user_telegram_id() needs, instead of looking it up via getUpdates
// (which requires a network call to api.telegram.org that isn't reachable
// from every environment).
//
// Unlike notify-managers (cron-triggered, service-role-authenticated), this
// function is a public HTTP endpoint Telegram itself calls -- deployed with
// verify_jwt: false, since Telegram's POSTs carry no Supabase JWT. The only
// thing standing between this URL and the open internet is the
// X-Telegram-Bot-Api-Secret-Token header, checked against
// TELEGRAM_WEBHOOK_SECRET (set via `setWebhook`'s secret_token param) --
// checked first, before anything else runs.
//
// Always replies 200 once authenticated (matched or not) -- a non-2xx makes
// Telegram retry the same update repeatedly, which isn't wanted here.
const WEBHOOK_SECRET_HEADER = 'x-telegram-bot-api-secret-token'

interface TelegramUpdate {
  message?: {
    text?: string
    from?: { id: number }
    chat?: { id: number }
  }
}

Deno.serve(async (req) => {
  const expectedSecret = Deno.env.get('TELEGRAM_WEBHOOK_SECRET')
  if (!expectedSecret || req.headers.get(WEBHOOK_SECRET_HEADER) !== expectedSecret) {
    return json({ error: 'unauthorized' }, 401)
  }

  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN')
  if (!botToken) {
    return json({ error: 'TELEGRAM_BOT_TOKEN is not set' }, 500)
  }

  let update: TelegramUpdate
  try {
    update = await req.json()
  } catch {
    return json({ ok: true }) // not valid JSON -- nothing to do, but still ack
  }

  const message = update.message
  const text = message?.text?.trim().toLowerCase()
  const fromId = message?.from?.id
  const chatId = message?.chat?.id

  if (!text || fromId === undefined || chatId === undefined || !isGetIdCommand(text)) {
    return json({ ok: true })
  }

  try {
    await sendTelegramMessage(botToken, chatId, `Your Telegram user ID: ${fromId}\nThis chat's ID: ${chatId}`)
  } catch (err) {
    console.error('telegram-webhook: failed to send reply', String(err))
    return json({ ok: false })
  }

  return json({ ok: true })
})

function isGetIdCommand(text: string): boolean {
  if (text === 'get my id') return true
  // Telegram appends "@botname" to slash commands in group chats.
  const command = text.split('@')[0]
  return command === '/getid'
}

async function sendTelegramMessage(botToken: string, chatId: number, text: string): Promise<void> {
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
