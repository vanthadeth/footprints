# Footprints, by HIG

Journal your sales journey.

Footprints is an internal, mobile-first field-sales PWA for recording
employee attendance, customer visits, sales journeys, GPS locations, fleet
status, and management reports — built on top of HIG's existing Supabase
backend (`hig-biz-opt`).

## What's built

- **Auth**: email/password sign-in, forgot/reset password, session-based
  route guards. Reuses the existing `auth.users` / `public.users` /
  `roles` / `role_permissions` system — no second auth model.
- **Attendance**: Clock In → Clock Out, independent of visits. Real-time
  selfie capture (camera only, never a file picker), GPS + accuracy, no
  geofence, auto check-out of an active visit on clock-out.
- **Customer Visits**: Check In → Check Out, requires an open attendance
  session. Nearby-customer suggestions by distance, unassigned visits,
  visit-radius monitoring via periodic location pings with auto check-out
  on radius breach, journey timeline with gap calculation.
- **Footprints**: personal journey history with date filters (Today /
  Yesterday / This Week / Last Week / This Month / Last Month / Custom),
  per-period stats, personal journey map.
- **Fleet**: live team status (Visiting / Idling / Off) with Supabase
  Realtime updates and a polling fallback, fleet map, member detail
  drill-down.
- **Dashboard & Reports**: attendance/fleet KPIs, visit & customer-coverage
  KPIs, By User / By Fleet reports — all date-filterable.
- **PWA**: installable, manifest + service worker (app-shell precache,
  storage-media runtime cache), mobile safe-area support.
- **Tests**: 50 unit tests covering the state machine, report/stat
  aggregation, timezone-correct date-range math, Haversine distance, and
  location accuracy classification. `npm test`.

Not yet built: offline write queuing (writes are blocked with a clear
message while offline, per spec, rather than queued — see §46 in the
original brief), full accessibility pass, end-to-end tests.

## Database

Reuses the existing Supabase project. `supabase/migrations/0066-0070` add
the pieces that were missing — read each file's header comment for exactly
what it does and why:

| Migration | What it does |
|---|---|
| `0066_footprints_attendance` | `attendance` + `location_pings` tables, nullable `visits.customer_id`, GPS accuracy/flags/visit_number columns, `clock_in`/`clock_out`/`record_location_ping`/`nearby_customers` RPCs, updated `check_in`/`check_out`, storage bucket, role permissions |
| `0067`, `0068` | Fixes discovered while applying `0066` (a Postgres function-overload gotcha, and a default-`EXECUTE`-to-`PUBLIC` grant in this environment) |
| `0069_footprints_my_team` | `app.my_team()` RPC backing the Fleet screen |
| `0070_footprints_realtime` | Registers `attendance`/`visits` with Supabase Realtime |
| `0072_footprints_manager_alerts_schema`, `0073_footprints_manager_alerts` | `late_clock_out` notification kind, `app.attendance_alerts()`/`app.chain_managers()` RPCs: detect late clock-in / late clock-out / idling-too-long, record a `notifications` row, and return each flagged user's chain of managers who have a `telegram_id` (reuses the existing, previously-unused `users.telegram_id` column) |
| `0074_footprints_manager_alerts_cron` | Schedules the alert check every 5 minutes via `pg_cron`/`pg_net`, calling the `notify-managers` Edge Function below. **Requires manual steps** — read the migration's header comment before applying |
| `0075_footprints_my_team_department` | Adds `department_id`/`department_name` to `app.my_team()`/`public.my_team()`, so Fleet's List and Reports tabs can group by department |
| `0076_footprints_telegram_id_super_admin` | `app.set_user_telegram_id()`/`public.set_user_telegram_id()` — lets a super admin (`users.is_super_admin`, independent of `role_permissions`) set any user's `telegram_id`; also exposes `telegram_id` on `manageable_users()` for the Users admin screen |
| `0077_footprints_auto_clockout_rules` | Refines the working-hours auto clock-out (`app.enforce_working_hours`): if a visit is still open, both it and the attendance session close at the later of today's `work_end_time` or 60 minutes after the visit started; otherwise the clock-out time is the last visit checked out that session, rounded up to the next quarter hour. `app._close_visit` gains an optional explicit close-time param for this (unused by its other call sites) |
| `0078_footprints_push_notifications` | `public.push_subscriptions` (a user's own Web Push device registrations), `notifications.pushed_at` marker, `app.pending_push_notifications()`/`app.mark_notifications_pushed()` (+ `public.*` wrappers, `service_role`-only) — lets the `push-notify-admins` Edge Function fan the existing anomaly notifications out to every super admin's subscribed device without ever resending an already-pushed case |
| `0079_footprints_push_notifications_cron` | Schedules the push fan-out every 5 minutes via `pg_cron`/`pg_net`, calling `push-notify-admins` below, same pattern as `0074`. **Requires manual steps** — read the migration's header comment before applying |

All migrations are additive: no existing table, column, row, or function
signature was removed or narrowed. **All are applied to the live
database** — this repo's `supabase/migrations/` is a record of what ran,
not a pending proposal.

The `notify-managers` Edge Function is deployed, but the manager-alerts
feature is still inert until two secrets are set (never committed to this
repo, see "Deployment" below): `TELEGRAM_BOT_TOKEN` on the Edge Function,
and a `service_role_key` entry in Supabase Vault for the cron job to
authenticate with. Once both are set and at least one manager has a
`telegram_id` (via the Users admin screen, Super Admin only), alerts start
flowing on the next 5-minute cron tick.

The `push-notify-admins` Edge Function is likewise deployed but inert until
its VAPID secrets are set (see "Push notifications" below) — the same
`service_role_key` Vault secret above covers its cron job too, nothing
extra needed there.

Security: every table has RLS; every RPC follows the codebase's existing
own/sub/any scope model (`app.can`/`app.effective_scope`) and is
explicitly granted to `authenticated` only (never `anon`, never `PUBLIC`).
Verified with `mcp__Supabase__get_advisors` after each change — no new
findings introduced.

## Running locally

```bash
npm install
cp .env.example .env.local   # fill in VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
npm run dev
```

Other scripts: `npm run build`, `npm run typecheck`, `npm run lint`, `npm test`.

The PWA icons under `public/icons/` and `public/apple-touch-icon.png` are
flat placeholder squares generated for a valid manifest — swap them for a
real designed icon before shipping.

## Deployment

**Supabase** — already deployed; nothing to do here to run the app. To
apply a *new* migration you add later: review it, then either run it via
`supabase db push` from a machine linked to the project, or apply it with
the Supabase MCP tools the way this repo's own migrations were applied.
Never apply an unreviewed migration to the live project.

**Vercel**:
1. Import this repository into Vercel (framework preset: Vite).
2. Set the environment variables below in the Vercel project settings
   (Production and Preview).
3. `vercel.json` already configures the SPA rewrite so client-side routes
   work on refresh/deep-link.
4. Deploy. Vercel builds with `npm run build` and serves `dist/`.

**GitHub Actions** (`.github/workflows/ci.yml`) runs typecheck, lint,
test, and build on every PR and on push to `main`.

**Edge Functions**:
- `supabase/functions/notify-managers` (pushes attendance alerts to
  managers over Telegram, called by the cron job in
  `0074_footprints_manager_alerts_cron`) is the first Edge Function
  checked into this repo. Deploy it with `supabase functions deploy
  notify-managers` and set its secret with `supabase secrets set
  TELEGRAM_BOT_TOKEN=<token>` — never commit that token. See
  `0074_footprints_manager_alerts_cron.sql`'s header comment for the full
  one-time setup (including seeding the service role key into Supabase
  Vault so the cron job can authenticate to the function).
- `supabase/functions/telegram-webhook` receives inbound Telegram messages
  and replies to "get my id" / `/getid` with the sender's numeric Telegram
  user ID and chat ID — a self-service way to find the value
  `set_user_telegram_id` (via the Users admin screen, Super Admin only)
  needs, without anyone having to look it up via `getUpdates`. Deployed
  with `verify_jwt: false` (Telegram's webhook POSTs carry no Supabase
  JWT); the only guard against spoofed requests is the
  `X-Telegram-Bot-Api-Secret-Token` header, checked against a
  `TELEGRAM_WEBHOOK_SECRET` secret. One-time setup:
  1. Deploy: `supabase functions deploy telegram-webhook`.
  2. Set secrets: `supabase secrets set TELEGRAM_BOT_TOKEN=<token>` (same
     bot token as `notify-managers`) and `supabase secrets set
     TELEGRAM_WEBHOOK_SECRET=<a random string you generate, e.g. via
     openssl rand -hex 20>`.
  3. Register the webhook with Telegram (run this yourself — it's a plain
     `curl` to `api.telegram.org`, nothing this repo can run for you):
     ```bash
     curl -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
       -H "Content-Type: application/json" \
       -d '{"url": "https://wbyrluggvuvnhxzfaeye.supabase.co/functions/v1/telegram-webhook", "secret_token": "<TELEGRAM_WEBHOOK_SECRET>"}'
     ```
  Once registered, message the bot with "get my id" or `/getid` from any
  account and it replies with that person's numeric IDs.
- `supabase/functions/push-notify-admins` sends the same anomaly
  notifications (late clock-in/out, idling too long, ineffective visit) to
  every super admin's Web Push-subscribed device — an additional channel
  alongside the in-app bell, not a replacement. Two modes: a cron-triggered
  fan-out (service-role auth, called every 5 minutes by
  `0079_footprints_push_notifications_cron`) and a self-test mode (a super
  admin's own session, sends one test push to just their own devices —
  wired to the "Send test push" button on the Notifications page). See
  "Push notifications" below for the one-time setup.

## Push notifications

Super admins can subscribe a device to Web Push for the same anomaly
notifications shown in the in-app bell (late clock-in/out, idling too long,
ineffective visit) — an additional channel, not a replacement; the bell and
Notifications page work exactly as before regardless of push. Toggle it
from the "Push Notifications" card at the top of the Notifications page.

Real Web Push needs a VAPID keypair (never committed to this repo). One-time
setup:

1. Generate a keypair (e.g. `npx web-push generate-vapid-keys`, or any tool
   that produces a P-256 EC keypair in the format the `web-push` library
   expects — a base64url-encoded uncompressed public point and the
   base64url-encoded private scalar).
2. Set `VITE_VAPID_PUBLIC_KEY` (safe to expose — it's public by design) in
   Vercel's environment variables and your local `.env.local`.
3. Set the Edge Function's secrets: `supabase secrets set
   VAPID_PUBLIC_KEY=<same public key>`, `supabase secrets set
   VAPID_PRIVATE_KEY=<the private key>`, `supabase secrets set
   VAPID_SUBJECT=mailto:<a real contact address>` (required by the Web Push
   spec so a push service can contact you if something's misconfigured).
4. Deploy `push-notify-admins` (see "Edge Functions" above) and confirm the
   `service_role_key` Vault secret the cron job needs is set (shared with
   `notify-managers` — see `0074`'s header comment if it isn't yet).

On iPhone specifically, push only works once the PWA is added to the Home
Screen (iOS 16.4+) — it will not fire for a plain Safari tab.

## Two independent systems

- **Attendance** (Clock In → Clock Out): the employee's working session.
- **Customer Visits** (Check In → Check Out): individual customer visits
  during that session.

They're related through the same user but are never coupled: a user can
clock in/out with zero visits, and can have many visits between one clock-in
and its clock-out.

## Tech stack

- Frontend: React, TypeScript, Vite, Tailwind, PWA (installable, offline
  app shell), Leaflet/OpenStreetMap for maps
- Backend: Supabase (PostgreSQL, Auth, Realtime, Storage, RPC)
- Hosting: GitHub (source) + Vercel (frontend) + Supabase (backend)

## Environment variables

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_MAP_PROVIDER=
VITE_MAP_API_KEY=
VITE_VAPID_PUBLIC_KEY=
```

`VITE_MAP_PROVIDER` defaults to OpenStreetMap (no key required) if unset;
set it to `mapbox` or `maptiler` with a matching `VITE_MAP_API_KEY` to
switch tile providers with no code change.

`VITE_VAPID_PUBLIC_KEY` is the public half of the Web Push keypair (see
"Push notifications" above) — safe to expose, unlike its private half,
which only ever lives as an Edge Function secret.

Never commit real values for these. `SUPABASE_SERVICE_ROLE_KEY` must never be
used in frontend code, and does not appear anywhere in this repository.
