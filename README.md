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
  customers, visits). A proposed additive migration adding the missing
  attendance (Clock In / Clock Out) layer lives in
  `supabase/migrations/0066_footprints_attendance.sql` — see that file's
  header comment for details. It has not been applied to the live database
  yet.
- **Frontend**: React + TypeScript + Vite, PWA-installable, mobile-first.

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
