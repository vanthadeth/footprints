-- Footprints: attendance alert detection + manager fan-out.
--
-- app.attendance_alerts() is the single entry point a scheduled job calls
-- (via public.run_attendance_alerts(), the public.* wrapper convention
-- this repo already uses -- see app.my_team()/public.my_team() in
-- 0069_footprints_my_team.sql). Each run:
--   1. Finds users newly matching one of three conditions (late clock-in,
--      late clock-out, idling too long), reusing the existing
--      app_settings thresholds (late_clockin_threshold_minutes,
--      auto_clockout_grace_minutes, idle_alert_threshold_minutes) rather
--      than inventing new config.
--   2. Inserts one public.notifications row per newly-matching case --
--      this is the same table/enum notificationsService.ts already reads
--      for the in-app bell, so those alerts now populate it for the first
--      time. A `not exists` guard on each insert is the de-dup: at most
--      one 'late_clock_in' per person per calendar day, and at most one
--      'late_clock_out'/'idling_too_long' per attendance session.
--   3. For each newly-inserted row, walks the flagged user's manager chain
--      (app.chain_managers -- direct manager, their manager, and so on)
--      and returns one (telegram_id, kind, message) row per chain manager
--      who has a telegram_id set, for the caller to push to Telegram.
--
-- Known limitations (acceptable for v1, easy to revisit):
--   * No workday/day-of-week concept exists anywhere in this schema, so
--     late-clock-in is checked every day including weekends.
--   * "Idling too long" fires once per attendance session, not once per
--     idle episode -- if a rep goes idle, gets a fresh alert, then starts
--     and ends a visit and goes idle again in the same shift, it won't
--     re-fire.
--
-- Callable only by service_role (the new supabase/functions/notify-managers
-- edge function, invoked by pg_cron in 0074) -- never exposed to
-- `authenticated`, since it writes arbitrary users' notifications and
-- returns every chain manager's telegram_id.

create or replace function app.chain_managers(p_user_id uuid)
returns table (manager_id uuid)
language sql
stable
set search_path to ''
as $function$
  with recursive chain(manager_id, depth) as (
    select u.manager_id, 1
      from public.users u
     where u.id = p_user_id and u.manager_id is not null
    union all
    select u.manager_id, c.depth + 1
      from public.users u
      join chain c on u.id = c.manager_id
     where u.manager_id is not null and c.depth < 20 -- guards a cyclic manager_id chain in bad data
  )
  select distinct manager_id from chain;
$function$;

comment on function app.chain_managers is
  'The direct manager of p_user_id, and their manager, and so on up the chain -- depth-capped so a cyclic manager_id (bad data) can''t loop forever.';

create or replace function app.attendance_alerts()
returns table (
  telegram_id     text,
  flagged_user_id uuid,
  kind            public.notification_kind,
  message         text
)
language sql
set search_path to ''
as $function$
  with settings as (
    select work_start_time::time as work_start,
           work_end_time::time as work_end,
           late_clockin_threshold_minutes,
           auto_clockout_grace_minutes,
           idle_alert_threshold_minutes
      from public.app_settings
     limit 1
  ),
  now_local as (
    select (now() at time zone 'Asia/Phnom_Penh') as ts
  ),
  late_in as (
    insert into public.notifications (user_id, kind, comment, occurred_at)
    select u.id, 'late_clock_in'::public.notification_kind,
           u.full_name || ' has not clocked in yet (work starts at ' || to_char(s.work_start, 'HH24:MI') || ').',
           now()
      from public.users u, settings s, now_local n
     where u.status = 'active'
       and n.ts::time >= s.work_start + make_interval(mins => s.late_clockin_threshold_minutes)
       and n.ts::time < s.work_end
       and not exists (
             select 1 from public.attendance a
              where a.user_id = u.id
                and (a.clock_in_at at time zone 'Asia/Phnom_Penh')::date = n.ts::date
           )
       and not exists (
             select 1 from public.notifications ex
              where ex.user_id = u.id and ex.kind = 'late_clock_in'
                and (ex.occurred_at at time zone 'Asia/Phnom_Penh')::date = n.ts::date
           )
    returning user_id, kind, null::uuid as attendance_id, comment
  ),
  late_out as (
    insert into public.notifications (user_id, kind, comment, occurred_at, attendance_id)
    select a.user_id, 'late_clock_out'::public.notification_kind,
           u.full_name || ' is still clocked in, ' || s.auto_clockout_grace_minutes || ' minutes past the end of working hours.',
           now(), a.id
      from public.attendance a
      join public.users u on u.id = a.user_id and u.status = 'active'
      cross join settings s
      cross join now_local n
     where a.clock_out_at is null
       and n.ts >= (n.ts::date + s.work_end + make_interval(mins => s.auto_clockout_grace_minutes))
       and not exists (select 1 from public.notifications ex where ex.attendance_id = a.id and ex.kind = 'late_clock_out')
    returning user_id, kind, attendance_id, comment
  ),
  idling as (
    insert into public.notifications (user_id, kind, comment, occurred_at, attendance_id)
    select a.user_id, 'idling_too_long'::public.notification_kind,
           u.full_name || ' has been idle (no active visit) for over ' || s.idle_alert_threshold_minutes || ' minutes.',
           now(), a.id
      from public.attendance a
      join public.users u on u.id = a.user_id and u.status = 'active'
      cross join settings s
     where a.clock_out_at is null
       and not exists (
             select 1 from public.visits v
              where v.user_id = a.user_id and v.checked_out_at is null and v.cancelled_at is null
           )
       and now() - greatest(
             a.clock_in_at,
             coalesce(
               (select max(v.checked_out_at) from public.visits v where v.attendance_id = a.id and v.checked_out_at is not null),
               a.clock_in_at
             )
           ) >= make_interval(mins => s.idle_alert_threshold_minutes)
       and not exists (select 1 from public.notifications ex where ex.attendance_id = a.id and ex.kind = 'idling_too_long')
    returning user_id, kind, attendance_id, comment
  ),
  all_new as (
    select * from late_in
    union all select * from late_out
    union all select * from idling
  )
  select mgr_user.telegram_id, an.user_id as flagged_user_id, an.kind, an.comment as message
    from all_new an
    join lateral app.chain_managers(an.user_id) cm on true
    join public.users mgr_user on mgr_user.id = cm.manager_id and mgr_user.telegram_id is not null;
$function$;

comment on function app.attendance_alerts is
  'Detects newly-late-clocking-in/late-clocking-out/idling users, records one public.notifications row per new case, and returns one row per (case, chain manager with a telegram_id) for the caller to push to Telegram. Safe to call repeatedly -- already-notified cases are skipped.';

create or replace function public.run_attendance_alerts()
returns table (
  telegram_id     text,
  flagged_user_id uuid,
  kind            public.notification_kind,
  message         text
)
language sql
set search_path to ''
as $function$ select * from app.attendance_alerts(); $function$;

-- Speeds up the de-dup `not exists` checks and the manager-chain walk above.
create index if not exists notifications_attendance_id_kind_idx on public.notifications (attendance_id, kind) where attendance_id is not null;
create index if not exists notifications_user_id_kind_occurred_at_idx on public.notifications (user_id, kind, occurred_at desc);
create index if not exists users_manager_id_idx on public.users (manager_id) where manager_id is not null;

-- This environment's migration-apply role grants EXECUTE to PUBLIC by
-- default (see 0068's comment) -- revoke it and grant only to service_role,
-- since this reads/writes across every user regardless of RLS.
revoke execute on function app.chain_managers(uuid) from public;
revoke execute on function app.attendance_alerts() from public;
revoke execute on function public.run_attendance_alerts() from public;

grant execute on function app.chain_managers(uuid) to service_role;
grant execute on function app.attendance_alerts() to service_role;
grant execute on function public.run_attendance_alerts() to service_role;
