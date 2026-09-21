// Footprints: Telegram webhook target -- handles inbound bot commands.
// /start replies with a welcome message and the command list; "get my id"
// (or /getid) replies with the sender's numeric Telegram user ID and this
// chat's ID, so a super admin can self-serve the value
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

const WELCOME_MESSAGE = `Welcome to the Footprints attendance bot.

This bot sends attendance alerts to managers and helps you find the Telegram IDs the app needs.

Commands:
/start - Show this welcome message and command list
/getid - Show your Telegram user ID and this chat's ID (or just type "get my id")`

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

  if (!text || chatId === undefined) {
    return json({ ok: true })
  }

  const command = matchCommand(text)
  if (!command || (command === 'getid' && fromId === undefined)) {
    return json({ ok: true })
  }

  const replyText = command === 'start' ? WELCOME_MESSAGE : `Your Telegram user ID: ${fromId}\nThis chat's ID: ${chatId}`

  try {
    await sendTelegramMessage(botToken, chatId, replyText)
  } catch (err) {
    console.error('telegram-webhook: failed to send reply', String(err))
    return json({ ok: false })
  }

  return json({ ok: true })
})

function matchCommand(text: string): 'start' | 'getid' | null {
  if (text === 'get my id') return 'getid'
  // Telegram appends "@botname" to slash commands in group chats.
  const command = text.split('@')[0]
  if (command === '/start') return 'start'
  if (command === '/getid') return 'getid'
  return null
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
