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

**Edge Functions**: `supabase/functions/notify-managers` (pushes attendance
alerts to managers over Telegram, called by the cron job in
`0074_footprints_manager_alerts_cron`) is the first Edge Function checked
into this repo. Deploy it with `supabase functions deploy notify-managers`
and set its secret with `supabase secrets set
TELEGRAM_BOT_TOKEN=<token>` — never commit that token. See
`0074_footprints_manager_alerts_cron.sql`'s header comment for the full
one-time setup (including seeding the service role key into Supabase
Vault so the cron job can authenticate to the function).

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
```

`VITE_MAP_PROVIDER` defaults to OpenStreetMap (no key required) if unset;
set it to `mapbox` or `maptiler` with a matching `VITE_MAP_API_KEY` to
switch tile providers with no code change.

Never commit real values for these. `SUPABASE_SERVICE_ROLE_KEY` must never be
used in frontend code, and does not appear anywhere in this repository.
