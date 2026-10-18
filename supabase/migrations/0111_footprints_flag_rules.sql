-- Footprints: flag rules -- late first visit, idle gaps with a lunch window,
-- forgotten check-outs, and the time an automatic clock-out is stamped.
--
-- Rules (all numbers are admin settings on app_settings):
--  1. The first customer check-in of the day after first_visit_deadline (10:00)
--     gets the flag LATE_FIRST_VISIT (app.check_in).
--  2. After the first visit, a gap is flagged when longer than the idle
--     threshold (idle_alert_threshold_minutes, 45); a gap overlapping the lunch
--     window (11:00-14:00) needs more than lunch_idle_threshold_minutes (90).
--     app.idle_threshold_minutes is the one place the manager alert asks; the
--     app mirrors it (src/features/attendance/idleRule.ts).
--  3. A visit left open when the person clocks out, or at the end of the day,
--     counts at most forgotten_visit_cap_minutes (30): it is closed at
--     check-in + the cap and the rest is a gap, flagged under rule 2.
--  4. An automatic clock-out is stamped at the later of the person's end of day
--     and their last check-out -- never "now", no rounding.
--
-- app.check_in and app.clock_out are patched from their LIVE definitions (read
-- with pg_get_functiondef): the repo's older copies differ.

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------
alter table public.app_settings
  add column first_visit_deadline         time    not null default '10:00',
  add column lunch_window_start           time    not null default '11:00',
  add column lunch_window_end             time    not null default '14:00',
  add column lunch_idle_threshold_minutes integer not null default 90 check (lunch_idle_threshold_minutes between 5 and 480),
  add column forgotten_visit_cap_minutes  integer not null default 30 check (forgotten_visit_cap_minutes between 5 and 240),
  add constraint app_settings_lunch_window_order check (lunch_window_end > lunch_window_start);

comment on column public.app_settings.first_visit_deadline is 'A first customer check-in of the day after this time (Asia/Phnom_Penh) is flagged LATE_FIRST_VISIT.';
comment on column public.app_settings.lunch_window_start is 'A gap overlapping lunch_window_start..lunch_window_end is possible lunch and needs lunch_idle_threshold_minutes to be flagged.';
comment on column public.app_settings.lunch_window_end is 'See lunch_window_start.';
comment on column public.app_settings.lunch_idle_threshold_minutes is 'Minutes a gap overlapping the lunch window must exceed to be flagged idle (otherwise idle_alert_threshold_minutes).';
comment on column public.app_settings.forgotten_visit_cap_minutes is 'A visit left open (closed by clock-out or at the end of the day) counts at most this many minutes.';

-- ---------------------------------------------------------------------------
-- How long a gap must be to be flagged
-- ---------------------------------------------------------------------------
create function app.idle_threshold_minutes(p_from timestamptz, p_to timestamptz)
returns integer
language sql
stable
set search_path = ''
as $$
  select case
           when (p_from at time zone 'Asia/Phnom_Penh')::date = (p_to at time zone 'Asia/Phnom_Penh')::date
            and (p_from at time zone 'Asia/Phnom_Penh')::time < s.lunch_window_end
            and (p_to   at time zone 'Asia/Phnom_Penh')::time > s.lunch_window_start
           then greatest(s.idle_alert_threshold_minutes, s.lunch_idle_threshold_minutes)
           else s.idle_alert_threshold_minutes
         end
    from public.app_settings s
   limit 1;
$$;

comment on function app.idle_threshold_minutes is
  'Minutes a gap from p_from to p_to must exceed to be flagged idle: the lunch threshold when it overlaps the lunch window (same local day), else the idle threshold.';

revoke execute on function app.idle_threshold_minutes(timestamptz, timestamptz) from public;
grant execute on function app.idle_threshold_minutes(timestamptz, timestamptz) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Closing an overdue session (rules 3 and 4)
-- ---------------------------------------------------------------------------
create or replace function app._auto_close_session(
  p_attendance uuid,
  p_latitude   numeric,
  p_longitude  numeric,
  p_accuracy   numeric,
  p_now        timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_open          public.attendance;
  v_work_end      timestamptz;
  v_deadline      timestamptz;
  v_cap           integer;
  v_open_visit    public.visits;
  v_closed_visit  public.visits;
  v_visit_close   timestamptz;
  v_last_checkout timestamptz;
  v_close_at      timestamptz;
  v_row           public.attendance;
begin
  select * into v_open from public.attendance where id = p_attendance and clock_out_at is null;
  if v_open.id is null then
    return jsonb_build_object('auto_clocked_out', false);
  end if;
  if auth.uid() is not null and v_open.user_id <> auth.uid() then
    raise exception 'insufficient_privilege' using errcode = 'insufficient_privilege';
  end if;

  v_work_end := app.session_work_end(v_open.user_id, v_open.clock_in_at);
  v_deadline := app.session_close_deadline(v_open.user_id, v_open.clock_in_at);
  if p_now < v_deadline then
    return jsonb_build_object('auto_clocked_out', false);
  end if;

  select forgotten_visit_cap_minutes into v_cap from public.app_settings limit 1;
  v_cap := coalesce(v_cap, 30);

  select * into v_open_visit
    from public.visits
   where user_id = v_open.user_id and checked_out_at is null and cancelled_at is null;

  if v_open_visit.id is not null then
    -- A visit nobody checked out of: it counts at most the cap, so it is closed
    -- that long after check-in (the time after is a gap). Wait until then
    -- rather than record a future time.
    v_visit_close := v_open_visit.checked_in_at + make_interval(mins => v_cap);
    if v_visit_close > p_now then
      return jsonb_build_object('auto_clocked_out', false);
    end if;

    select * into v_closed_visit
      from app._close_visit(v_open_visit.id, p_latitude, p_longitude, p_accuracy, 'AUTO_CHECKOUT_WORKING_HOURS_END', p_checked_out_at => v_visit_close);
  end if;

  -- The clock-out is the later of the end of the day and the last check-out
  -- (the one just made included), never later than now.
  select max(checked_out_at) into v_last_checkout
    from public.visits
   where attendance_id = v_open.id and checked_out_at is not null and cancelled_at is null;

  v_close_at := greatest(v_work_end, coalesce(v_last_checkout, v_work_end));
  v_close_at := greatest(least(v_close_at, p_now), v_open.clock_in_at);

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
-- Clock-out: a visit left open counts at most the cap (rule 3)
-- ---------------------------------------------------------------------------
create or replace function app.clock_out(p_latitude numeric, p_longitude numeric, p_accuracy numeric, p_selfie_path text)
 returns jsonb
 language plpgsql
 set search_path to ''
as $function$
declare
  v_me          uuid := auth.uid();
  v_open        public.attendance;
  v_max_acc     integer;
  v_cap         integer;
  v_flags       text[];
  v_visit_id    uuid;
  v_visit_in    timestamptz;
  v_closed      public.visits;
  v_row         public.attendance;
  v_location_id uuid;
begin
  if v_me is null then
    raise exception 'Not signed in' using errcode = 'insufficient_privilege';
  end if;
  if p_selfie_path is null or btrim(p_selfie_path) = '' then
    raise exception 'A clock-out selfie is required' using errcode = 'check_violation';
  end if;
  if p_latitude is null or p_longitude is null then
    raise exception 'Location is required to clock out' using errcode = 'check_violation';
  end if;

  select * into v_open from public.attendance where user_id = v_me and clock_out_at is null;
  if v_open.id is null then
    raise exception 'You are not clocked in.' using errcode = 'no_data_found';
  end if;

  -- Checked before anything changes, so a refused clock-out leaves the open visit alone.
  perform app.assert_clock_location(v_me, 'out', p_latitude, p_longitude);

  -- Critical rule: clocking out while a visit is still active force-checks
  -- that visit out first, flagged distinctly from a radius-triggered one,
  -- rather than blocking the clock-out. A visit nobody checked out of counts
  -- at most the forgotten-visit cap: it is closed that long after check-in.
  select id, checked_in_at into v_visit_id, v_visit_in
    from public.visits
   where user_id = v_me and checked_out_at is null and cancelled_at is null;

  if v_visit_id is not null then
    select forgotten_visit_cap_minutes into v_cap from public.app_settings limit 1;
    select * into v_closed
      from app._close_visit(v_visit_id, p_latitude, p_longitude, p_accuracy, 'AUTO_CHECKOUT_CLOCK_OUT',
                            p_checked_out_at => least(now(), v_visit_in + make_interval(mins => coalesce(v_cap, 30))));
  end if;

  select max_location_accuracy_m into v_max_acc from public.app_settings limit 1;
  v_max_acc := coalesce(v_max_acc, 100);

  v_flags := v_open.flags;
  if p_accuracy is not null and p_accuracy > v_max_acc and not (v_flags @> array['LOW_LOCATION_ACCURACY']) then
    v_flags := array_append(v_flags, 'LOW_LOCATION_ACCURACY');
  end if;

  select id into v_location_id
    from public.work_locations
   where active
     and app.metres_between(p_latitude, p_longitude, latitude, longitude) <= radius_m
   order by app.metres_between(p_latitude, p_longitude, latitude, longitude) asc
   limit 1;

  update public.attendance
     set clock_out_at = now(),
         clock_out_latitude = p_latitude,
         clock_out_longitude = p_longitude,
         clock_out_accuracy_m = p_accuracy,
         clock_out_selfie_path = p_selfie_path,
         clock_out_location_id = v_location_id,
         flags = v_flags
   where id = v_open.id
  returning * into v_row;

  return jsonb_build_object(
    'attendance', to_jsonb(v_row),
    'auto_checked_out_visit', to_jsonb(v_closed)
  );
end;
$function$;

-- ---------------------------------------------------------------------------
-- Check-in: LATE_FIRST_VISIT (rule 1) and the error text follows the setting
-- ---------------------------------------------------------------------------
create or replace function app.check_in(p_customer uuid, p_latitude numeric, p_longitude numeric, p_accuracy numeric DEFAULT NULL::numeric)
 returns public.visits
 language plpgsql
 set search_path to ''
as $function$
declare
  v_me         uuid := auth.uid();
  v_radius     integer;
  v_max_acc    integer;
  v_lat        numeric;
  v_lng        numeric;
  v_dist       integer;
  v_visit      public.visits;
  v_attendance uuid;
  v_flags      text[] := '{}';
  v_number     integer;
  v_win_start  time;
  v_win_end    time;
  v_deadline   time;
begin
  if v_me is null then
    raise exception 'Not signed in' using errcode = 'insufficient_privilege';
  end if;

  if not app.within_check_window() then
    select check_window_start, check_window_end into v_win_start, v_win_end from public.app_settings limit 1;
    raise exception 'Check-in is only allowed between % and %.',
      to_char(coalesce(v_win_start, time '07:00'), 'HH24:MI'), to_char(coalesce(v_win_end, time '20:00'), 'HH24:MI')
      using errcode = 'check_violation';
  end if;

  select id into v_attendance
    from public.attendance
   where user_id = v_me and clock_out_at is null;

  if v_attendance is null then
    raise exception 'You must clock in before starting a visit.'
      using errcode = 'check_violation';
  end if;

  if exists (
    select 1 from public.visits
     where user_id = v_me and checked_out_at is null and cancelled_at is null
  ) then
    raise exception 'You are still checked in somewhere. Check out first.'
      using errcode = 'unique_violation';
  end if;

  select checkin_radius_m, max_location_accuracy_m, first_visit_deadline into v_radius, v_max_acc, v_deadline
    from public.app_settings limit 1;
  v_radius := coalesce(v_radius, 200);
  v_max_acc := coalesce(v_max_acc, 100);

  if p_accuracy is not null and p_accuracy > v_max_acc then
    raise exception 'Location accuracy is too low (% m) to check in -- % m or better is required. Move to an open area and try again.',
      round(p_accuracy), v_max_acc
      using errcode = 'check_violation';
  end if;

  if p_customer is not null then
    select c.latitude, c.longitude into v_lat, v_lng
      from public.customers c where c.id = p_customer;

    if not found then
      raise exception 'No such customer' using errcode = 'no_data_found';
    end if;
  else
    v_flags := array_append(v_flags, 'UNASSIGNED_VISIT');
  end if;

  if v_lat is not null and p_latitude is not null then
    v_dist := round(app.metres_between(p_latitude, p_longitude, v_lat, v_lng));
  end if;

  select count(*) + 1 into v_number
    from public.visits
   where user_id = v_me
     and (checked_in_at at time zone 'Asia/Phnom_Penh')::date
       = (now() at time zone 'Asia/Phnom_Penh')::date;

  -- The first customer visit of the day, after the deadline.
  if v_number = 1 and (now() at time zone 'Asia/Phnom_Penh')::time > coalesce(v_deadline, time '10:00') then
    v_flags := array_append(v_flags, 'LATE_FIRST_VISIT');
  end if;

  insert into public.visits (
    customer_id, in_latitude, in_longitude, in_accuracy_m,
    distance_m, radius_m, out_of_range, attendance_id, visit_number, flags
  ) values (
    p_customer, p_latitude, p_longitude, p_accuracy,
    v_dist, v_radius, coalesce(v_dist > v_radius, false),
    v_attendance, v_number, v_flags
  )
  returning * into v_visit;

  return v_visit;
end;
$function$;

-- ---------------------------------------------------------------------------
-- Manager alerts: the idle threshold follows the lunch window
-- ---------------------------------------------------------------------------
-- Same as 0110 except `idling`: how long a gap must be comes from
-- app.idle_threshold_minutes (the lunch threshold when it overlaps the lunch
-- window), and the message says the threshold that applied.
create or replace function app.attendance_alerts()
 returns table(telegram_id text, flagged_user_id uuid, kind public.notification_kind, message text)
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
       and app.day_off_mode(u.id, n.ts::date) <> 'flexible'
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
           u.full_name || ' is still clocked in, ' || cw.auto_clockout_grace_minutes || ' minutes past the end of working hours.',
           now(), a.id
      from public.attendance a
      join public.users u on u.id = a.user_id and u.status = 'active'
      cross join settings s
      cross join now_local n
      cross join lateral app.work_day(a.user_id, n.ts::date) w
      cross join lateral app.clock_window(a.user_id) cw
     where a.clock_out_at is null
       and n.ts >= (n.ts::date + w.end_time + make_interval(mins => cw.auto_clockout_grace_minutes))
       and not exists (select 1 from public.notifications ex where ex.attendance_id = a.id and ex.kind = 'late_clock_out')
    returning user_id, kind, attendance_id, comment
  ),
  idling as (
    insert into public.notifications (user_id, kind, comment, occurred_at, attendance_id)
    select a.user_id, 'idling_too_long'::public.notification_kind,
           u.full_name || ' has been idle (no active visit) for over ' || app.idle_threshold_minutes(lv.last_out, now()) || ' minutes.',
           now(), a.id
      from public.attendance a
      join public.users u on u.id = a.user_id and u.status = 'active'
      cross join settings s
      cross join now_local n
      cross join lateral app.work_day(a.user_id, n.ts::date) w
      cross join lateral (
        select max(v.checked_out_at) as last_out
          from public.visits v
         where v.attendance_id = a.id and v.cancelled_at is null and v.checked_out_at is not null
      ) lv
     where a.clock_out_at is null
       and w.is_working
       and lv.last_out is not null
       and n.ts::time >= w.start_time
       and n.ts::time < w.end_time
       and not exists (
             select 1 from public.visits v
              where v.user_id = a.user_id and v.checked_out_at is null and v.cancelled_at is null
           )
       and not exists (
             select 1 from public.leave_requests lr
              where lr.user_id = a.user_id and lr.status = 'approved'
                and n.ts::date between lr.start_date and lr.end_date
           )
       and now() - lv.last_out >= make_interval(mins => app.idle_threshold_minutes(lv.last_out, now()))
       and not exists (
             select 1 from public.notifications ex
              where ex.attendance_id = a.id and ex.kind = 'idling_too_long' and ex.occurred_at >= lv.last_out
           )
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
