-- Footprints: several clock-in / clock-out sessions a day -- don't take the break twice.
--
-- A day can have more than one session (clock out for lunch, clock back in).
-- app.attendance_days already adds the sessions up, but then still took the
-- whole unpaid break off the total, so a person who clocked out for their
-- lunch hour lost it twice. Now time off the clock between the day's sessions
-- counts toward the unpaid break first; only what's left of the break is
-- taken off. One session a day works out exactly as before.
--
-- last_out is also null while one of the day's sessions is still open
-- (it used to show an earlier session's clock-out, so a person back from
-- lunch read as gone home).
--
-- Same signature and columns as 0100; only the att CTE (last_out, off_mins)
-- and the worked_minutes expression change.

create or replace function app.attendance_days(p_from date, p_to date)
returns table (
  user_id uuid, day date, status text, is_working boolean, scheduled_start time, scheduled_end time,
  late_minutes integer, worked_minutes integer, first_in timestamptz, last_out timestamptz,
  leave_type public.leave_type, leave_fraction numeric, holiday_name text
)
language sql
stable
security definer
set search_path to ''
as $function$
  with bounds as (
    select greatest(p_from, p_to - 61) as f, p_to as t, (now() at time zone 'Asia/Phnom_Penh') as now_local
  ),
  s as (select coalesce(late_grace_minutes, 5) as grace from public.app_settings limit 1),
  people as (
    select u.id from public.users u where u.status = 'active' and app.can('attendance', 'view', u.id)
  ),
  days as (
    select g::date as d from bounds b, generate_series(b.f, b.t, interval '1 day') g
  ),
  sessions as (
    select a.user_id,
           (a.clock_in_at at time zone 'Asia/Phnom_Penh')::date as d,
           a.clock_in_at,
           a.clock_out_at,
           coalesce(a.clock_out_at, least(now(), a.clock_in_at + interval '16 hours')) as ends_at
      from public.attendance a, bounds b
     where a.user_id in (select id from people)
       and (a.clock_in_at at time zone 'Asia/Phnom_Penh')::date between b.f and b.t
  ),
  att as (
    select x.user_id, x.d,
           min(x.clock_in_at) as first_in,
           -- Null while a session is still open, not an earlier session's clock-out.
           case when bool_and(x.clock_out_at is not null) then max(x.clock_out_at) end as last_out,
           sum(extract(epoch from (x.ends_at - x.clock_in_at)) / 60)::integer as mins,
           -- Time off the clock between the day's sessions (0 with one session).
           greatest(0, (extract(epoch from (max(x.ends_at) - min(x.clock_in_at))) / 60
                        - sum(extract(epoch from (x.ends_at - x.clock_in_at)) / 60))::integer) as off_mins
      from sessions x
     group by 1, 2
  ),
  lv as (
    select distinct on (r.user_id, dd.d) r.user_id, dd.d, r.leave_type,
           app.leave_request_days(r.user_id, dd.d, dd.d,
             case when r.start_date = r.end_date then (case when r.start_period <> 'full' then r.start_period else r.end_period end)
                  when dd.d = r.start_date then r.start_period
                  when dd.d = r.end_date then r.end_period
                  else 'full'::public.leave_day_period end,
             case when r.start_date = r.end_date then (case when r.start_period <> 'full' then r.start_period else r.end_period end)
                  when dd.d = r.start_date then r.start_period
                  when dd.d = r.end_date then r.end_period
                  else 'full'::public.leave_day_period end) as fraction
      from public.leave_requests r
      join days dd on dd.d between r.start_date and r.end_date
     where r.status = 'approved' and r.user_id in (select id from people)
     order by r.user_id, dd.d, r.created_at
  )
  select
    p.id,
    dd.d,
    case
      when a.first_in is not null and w.is_working
           and (a.first_in at time zone 'Asia/Phnom_Penh')::time > w.start_time + make_interval(mins => s.grace) then 'late'
      when a.first_in is not null then 'present'
      when l.fraction > 0 then 'leave'
      when not w.is_working and w.holiday_id is not null then 'holiday'
      when not w.is_working then 'off'
      when dd.d > (select now_local from bounds)::date
        or (dd.d = (select now_local from bounds)::date and (select now_local from bounds)::time < w.end_time) then 'upcoming'
      -- Flexible days off: no clock-in uses the cycle's allowance.
      when app.day_off_mode(p.id, dd.d) = 'flexible' then 'dayoff'
      else 'absent'
    end,
    w.is_working,
    w.start_time,
    w.end_time,
    case when a.first_in is not null and w.is_working
         then greatest(0, (extract(epoch from ((a.first_in at time zone 'Asia/Phnom_Penh')::time - w.start_time)) / 60)::integer)
         else 0 end,
    -- An unpaid break comes off a day of at least break + 1 h, less any time already off the clock between sessions.
    case when a.mins is null then 0
         when not w.break_paid and a.mins >= w.break_minutes + 60 then a.mins - greatest(0, w.break_minutes - a.off_mins)
         else a.mins end,
    a.first_in,
    a.last_out,
    l.leave_type,
    coalesce(l.fraction, 0),
    w.holiday_name
  from people p
  cross join days dd
  cross join s
  cross join lateral app.work_day(p.id, dd.d) w
  left join att a on a.user_id = p.id and a.d = dd.d
  left join lv l on l.user_id = p.id and l.d = dd.d
  order by p.id, dd.d;
$function$;
