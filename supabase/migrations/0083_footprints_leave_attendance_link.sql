-- Footprints: Leave Management -- exclude an approved leave day from the
-- late-clock-in absence alert (product decision: an approved leave should
-- read as "on leave", not a false absence).
--
-- Same signature as the existing app.attendance_alerts() (0073) -- just one
-- extra guard added to the late_in CTE's where clause, create or replace
-- in place (no DROP needed since the RETURNS TABLE columns are unchanged).

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
       and not exists (
             select 1 from public.leave_requests lr
              where lr.user_id = u.id and lr.status = 'approved'
                and n.ts::date between lr.start_date and lr.end_date
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
  'Detects newly-late-clocking-in/late-clocking-out/idling users (skipping anyone with an approved leave covering today), records one public.notifications row per new case, and returns one row per (case, chain manager with a telegram_id) for the caller to push to Telegram. Safe to call repeatedly -- already-notified cases are skipped.';
