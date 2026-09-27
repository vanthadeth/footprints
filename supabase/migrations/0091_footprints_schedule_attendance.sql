-- Footprints: make clock-in, alerts and auto clock-out follow each person's
-- schedule (team override or company schedule, minus public holidays --
-- app.work_day, 0089), and add the per-day attendance feed behind the
-- weekly/monthly summaries.
--
-- Every function below was copied from its live definition (read with
-- pg_get_functiondef before writing this) and changed ONLY where it read
-- app_settings.work_start_time/work_end_time:
--   * app.within_clock_in_window() -- the person's start/end for today. On a
--     day off the stored times for that weekday still apply, so clock-in is
--     never blocked just because it's a day off (same as before).
--   * app.enforce_working_hours()  -- auto clock-out at the person's end.
--   * app.notify_late_clock_in()   -- trigger: late vs the person's start,
--     and never on a day off or public holiday.
--   * app.attendance_alerts()      -- "not clocked in yet" only on the
--     person's working days, against their own start; "still clocked in"
--     against their own end.
--
-- app.attendance_days(from, to) returns one row per person x date with a
-- status (present / late / absent / leave / holiday / off / upcoming), the
-- minutes late (vs start + app_settings.late_grace_minutes), minutes worked
-- (net of an unpaid break) and the leave/holiday behind a day off.

-- ---------------------------------------------------------------------------
-- Clock-in window
-- ---------------------------------------------------------------------------
create or replace function app.within_clock_in_window()
returns boolean
language plpgsql
stable
set search_path to ''
as $function$
declare
  v_override text := nullif(current_setting('higtest.now', true), '');
  v_at       timestamptz := coalesce(v_override::timestamptz, now());
  v_local    time := (v_at at time zone 'Asia/Phnom_Penh')::time;
  v_start    time;
  v_end      time;
  v_early    integer;
begin
  select w.start_time, w.end_time into v_start, v_end
    from app.work_day(auth.uid(), (v_at at time zone 'Asia/Phnom_Penh')::date) w;
  select allow_early_clockin_minutes into v_early from public.app_settings limit 1;
  v_start := coalesce(v_start, time '08:00');
  v_end := coalesce(v_end, time '17:00');
  v_early := coalesce(v_early, 0);

  return v_local >= (v_start - make_interval(mins => v_early)) and v_local < v_end;
end;
$function$;

-- ---------------------------------------------------------------------------
-- Auto clock-out at the person's end of day
-- ---------------------------------------------------------------------------
create or replace function app.enforce_working_hours(p_latitude numeric, p_longitude numeric, p_accuracy numeric default null::numeric)
returns jsonb
language plpgsql
set search_path to ''
as $function$
declare
  v_me             uuid := auth.uid();
  v_open           public.attendance;
  v_end            time;
  v_grace          integer;
  v_override       text := nullif(current_setting('higtest.now', true), '');
  v_at             timestamptz := coalesce(v_override::timestamptz, now());
  v_local          time := (v_at at time zone 'Asia/Phnom_Penh')::time;
  v_work_end_today timestamptz;
  v_open_visit     public.visits;
  v_closed_visit   public.visits;
  v_last_checkout  timestamptz;
  v_close_at       timestamptz;
  v_row            public.attendance;
begin
  if v_me is null then
    raise exception 'Not signed in' using errcode = 'insufficient_privilege';
  end if;

  select * into v_open from public.attendance where user_id = v_me and clock_out_at is null;
  if v_open.id is null then
    return jsonb_build_object('auto_clocked_out', false);
  end if;

  select w.end_time into v_end from app.work_day(v_me, (v_at at time zone 'Asia/Phnom_Penh')::date) w;
  select auto_clockout_grace_minutes into v_grace from public.app_settings limit 1;
  v_end := coalesce(v_end, time '17:00');
  v_grace := coalesce(v_grace, 0);

  if v_local < (v_end + make_interval(mins => v_grace)) then
    return jsonb_build_object('auto_clocked_out', false);
  end if;

  if p_latitude is null or p_longitude is null then
    return jsonb_build_object('auto_clocked_out', false);
  end if;

  -- Today's off-work-hour as a timestamptz: truncate v_at to local midnight,
  -- add the work_end_time-of-day, then reinterpret that plain timestamp as
  -- a Phnom Penh wall-clock time to get back a timestamptz.
  v_work_end_today := (date_trunc('day', v_at at time zone 'Asia/Phnom_Penh') + v_end) at time zone 'Asia/Phnom_Penh';

  select * into v_open_visit
    from public.visits
   where user_id = v_me and checked_out_at is null and cancelled_at is null;

  if v_open_visit.id is not null then
    -- Rule: still mid-visit when working hours end -- close both the visit
    -- and the attendance session at the later of "off work hour" or 60
    -- minutes after the visit started, never rounded (both bounds are
    -- already deterministic, not an arbitrary "now").
    v_close_at := greatest(v_work_end_today, v_open_visit.checked_in_at + interval '60 minutes');

    select * into v_closed_visit
      from app._close_visit(v_open_visit.id, p_latitude, p_longitude, p_accuracy, 'AUTO_CHECKOUT_WORKING_HOURS_END', p_checked_out_at => v_close_at);
  else
    -- Rule: otherwise, base the clock-out time on the last visit checked
    -- out this session, rounded up to the next quarter hour -- so a
    -- delayed background check doesn't record a clock-out later than when
    -- the person actually finished. Falls back to "now" (also rounded up)
    -- if no visit was checked out this session at all.
    select max(checked_out_at) into v_last_checkout
      from public.visits
     where attendance_id = v_open.id and checked_out_at is not null and cancelled_at is null;

    v_close_at := app._round_up_to_quarter_hour(coalesce(v_last_checkout, v_at));
  end if;

  update public.attendance
     set clock_out_at = v_close_at,
         clock_out_latitude = p_latitude,
         clock_out_longitude = p_longitude,
         clock_out_accuracy_m = p_accuracy,
         auto_clocked_out = true,
         flags = array_append(flags, 'AUTO_CLOCKOUT_WORKING_HOURS_END')
   where id = v_open.id
  returning * into v_row;

  return jsonb_build_object(
    'auto_clocked_out', true,
    'attendance', to_jsonb(v_row),
    'auto_checked_out_visit', to_jsonb(v_closed_visit)
  );
end;
$function$;

-- ---------------------------------------------------------------------------
-- Late clock-in notification (trigger on attendance insert)
-- ---------------------------------------------------------------------------
create or replace function app.notify_late_clock_in()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_start        time;
  v_working      boolean;
  v_threshold    int;
  v_local_time   time;
  v_minutes_late numeric;
begin
  select w.start_time, w.is_working into v_start, v_working
    from app.work_day(NEW.user_id, (NEW.clock_in_at at time zone 'Asia/Phnom_Penh')::date) w;
  select late_clockin_threshold_minutes into v_threshold from public.app_settings limit 1;

  if not coalesce(v_working, true) then
    return NEW; -- a day off or public holiday: nobody is late
  end if;

  if exists (
    select 1 from public.attendance a2
    where a2.user_id = NEW.user_id
      and a2.id <> NEW.id
      and (a2.clock_in_at at time zone 'Asia/Phnom_Penh')::date = (NEW.clock_in_at at time zone 'Asia/Phnom_Penh')::date
      and a2.clock_in_at < NEW.clock_in_at
  ) then
    return NEW; -- not the first session today
  end if;

  v_local_time := (NEW.clock_in_at at time zone 'Asia/Phnom_Penh')::time;
  v_minutes_late := extract(epoch from (v_local_time - v_start)) / 60;

  if v_minutes_late > v_threshold then
    insert into public.notifications (user_id, kind, attendance_id, occurred_at, comment, details)
    values (
      NEW.user_id, 'late_clock_in', NEW.id, NEW.clock_in_at,
      format('Clocked in %s minutes after the %s start time.', round(v_minutes_late), to_char(v_start, 'HH24:MI')),
      jsonb_build_object('minutes_late', round(v_minutes_late))
    );
  end if;

  return NEW;
end;
$function$;

-- ---------------------------------------------------------------------------
-- Manager alerts
-- ---------------------------------------------------------------------------
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
    select late_clockin_threshold_minutes,
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
           u.full_name || ' has not clocked in yet (work starts at ' || to_char(w.start_time, 'HH24:MI') || ').',
           now()
      from public.users u
      cross join settings s
      cross join now_local n
      cross join lateral app.work_day(u.id, n.ts::date) w
     where u.status = 'active'
       and w.is_working
       and n.ts::time >= w.start_time + make_interval(mins => s.late_clockin_threshold_minutes)
       and n.ts::time < w.end_time
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
      cross join lateral app.work_day(a.user_id, n.ts::date) w
     where a.clock_out_at is null
       and n.ts >= (n.ts::date + w.end_time + make_interval(mins => s.auto_clockout_grace_minutes))
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
  'Detects newly-late-clocking-in (on the person''s working days, vs their own schedule, skipping approved leave and public holidays), late-clocking-out (vs their own end time) and idling users, records one public.notifications row per new case, and returns one row per (case, chain manager with a telegram_id) for the caller to push to Telegram.';

-- ---------------------------------------------------------------------------
-- Per-day attendance feed for the summaries
-- ---------------------------------------------------------------------------
-- Security definer: joins attendance, approved leave and schedules for
-- everyone the caller may view attendance for (app.can), and returns only
-- per-day aggregates. At most 62 days per call.
create function app.attendance_days(p_from date, p_to date)
returns table (
  user_id         uuid,
  day             date,
  status          text,
  is_working      boolean,
  scheduled_start time,
  scheduled_end   time,
  late_minutes    integer,
  worked_minutes  integer,
  first_in        timestamptz,
  last_out        timestamptz,
  leave_type      public.leave_type,
  leave_fraction  numeric,
  holiday_name    text
)
language sql
stable
security definer
set search_path = ''
as $$
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
  att as (
    select a.user_id,
           (a.clock_in_at at time zone 'Asia/Phnom_Penh')::date as d,
           min(a.clock_in_at) as first_in,
           max(a.clock_out_at) as last_out,
           sum(extract(epoch from (coalesce(a.clock_out_at, least(now(), a.clock_in_at + interval '16 hours')) - a.clock_in_at)) / 60)::integer as mins
      from public.attendance a, bounds b
     where a.user_id in (select id from people)
       and (a.clock_in_at at time zone 'Asia/Phnom_Penh')::date between b.f and b.t
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
      else 'absent'
    end,
    w.is_working,
    w.start_time,
    w.end_time,
    case when a.first_in is not null and w.is_working
         then greatest(0, (extract(epoch from ((a.first_in at time zone 'Asia/Phnom_Penh')::time - w.start_time)) / 60)::integer)
         else 0 end,
    case when a.mins is null then 0
         when not w.break_paid and a.mins >= w.break_minutes + 60 then a.mins - w.break_minutes
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
$$;

comment on function app.attendance_days is
  'One row per active person the caller may view attendance for x date in [p_from, p_to] (max 62 days): status present/late/absent/leave/holiday/off/upcoming, late minutes (first clock-in vs scheduled start; late beyond app_settings.late_grace_minutes), worked minutes (net of an unpaid break), approved leave and holiday.';

create function public.attendance_days(p_from date, p_to date)
returns table (
  user_id         uuid,
  day             date,
  status          text,
  is_working      boolean,
  scheduled_start time,
  scheduled_end   time,
  late_minutes    integer,
  worked_minutes  integer,
  first_in        timestamptz,
  last_out        timestamptz,
  leave_type      public.leave_type,
  leave_fraction  numeric,
  holiday_name    text
)
language sql
stable
set search_path = ''
as $$ select * from app.attendance_days(p_from, p_to); $$;

-- The two summary settings. Read by anyone signed in; the cycle day is
-- written by settings:edit (early/grace/auto clock-out minutes are plain
-- app_settings columns, updated directly under its RLS).
create function public.attendance_settings()
returns table (late_grace_minutes integer, attendance_cycle_close_day smallint)
language sql
stable
security definer
set search_path = ''
as $$ select late_grace_minutes, attendance_cycle_close_day from public.app_settings limit 1; $$;

create function app.set_attendance_cycle(p_close_day integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app.can('settings', 'edit') then
    raise exception 'insufficient_privilege';
  end if;
  if p_close_day < 0 or p_close_day > 28 then
    raise exception 'invalid_close_day' using detail = 'Pick a day from 1 to 28, or 0 for the calendar month.';
  end if;
  update public.app_settings set attendance_cycle_close_day = p_close_day, updated_at = now(), updated_by = auth.uid() where id = true;
end;
$$;

create function public.set_attendance_cycle(p_close_day integer)
returns void
language sql
set search_path = ''
as $$ select app.set_attendance_cycle(p_close_day); $$;

revoke execute on function app.attendance_days(date, date) from public;
revoke execute on function public.attendance_days(date, date) from public;
revoke execute on function public.attendance_settings() from public;
revoke execute on function app.set_attendance_cycle(integer) from public;
revoke execute on function public.set_attendance_cycle(integer) from public;
grant execute on function app.attendance_days(date, date) to authenticated;
grant execute on function public.attendance_days(date, date) to authenticated;
grant execute on function public.attendance_settings() to authenticated;
grant execute on function app.set_attendance_cycle(integer) to authenticated;
grant execute on function public.set_attendance_cycle(integer) to authenticated;
