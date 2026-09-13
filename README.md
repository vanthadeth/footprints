# Footprints, by HIG

Journal your sales journey.

Footprints is an internal, mobile-first field-sales PWA for recording
employee attendance, customer visits, sales journeys, GPS locations, fleet
status, and management reports — built on top of HIG's existing Supabase
backend (`hig-biz-opt`).

## Status

This repository is under active development. See open pull requests for
current progress.

- **Backend**: reuses the existing Supabase project (auth, users, roles,
  customers, visits). `supabase/migrations/0066-0068` add the attendance
  (Clock In / Clock Out) layer that was missing, plus location-ping
  monitoring and unassigned-visit support — see those files' header
  comments for details. **Applied to the live database.**
- **Frontend**: React + TypeScript + Vite, PWA-installable, mobile-first.
  Welcome → Login → bottom-nav shell (Check In / Footprints / Fleet /
  Profile / Menu) is wired up; Check In implements the full Clock In/Out +
  Check In/Out flow (real-time selfie capture, GPS + accuracy, auto
  check-out on clock-out and on radius breach, journey timeline). Fleet,
  Footprints history/map, dashboard, and reports are not built yet.

### Running locally

```bash
npm install
cp .env.example .env.local   # fill in VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
npm run dev
```

Other scripts: `npm run build`, `npm run typecheck`, `npm run lint`, `npm test`.

The PWA icons under `public/icons/` and `public/apple-touch-icon.png` are
flat placeholder squares generated for a valid manifest — swap them for a
real designed icon before shipping.

## Two independent systems

- **Attendance** (Clock In → Clock Out): the employee's working session.
- **Customer Visits** (Check In → Check Out): individual customer visits
  during that session.

They're related through the same user but are never coupled: a user can
clock in/out with zero visits, and can have many visits between one clock-in
and its clock-out.

## Tech stack

- Frontend: React, TypeScript, Vite, PWA (installable, offline app shell)
- Backend: Supabase (PostgreSQL, Auth, Realtime, Storage, RPC)
- Hosting: GitHub (source) + Vercel (frontend) + Supabase (backend)

## Environment variables

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_MAP_PROVIDER=
VITE_MAP_API_KEY=
```

Never commit real values for these. `SUPABASE_SERVICE_ROLE_KEY` must never be
used in frontend code.
