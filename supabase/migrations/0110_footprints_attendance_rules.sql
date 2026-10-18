-- Footprints: attendance rules review -- forgotten clock-outs, one idle
-- detector, an editable check-in/out window, short visits.
--
-- Written against the LIVE definitions (read with pg_get_functiondef before
-- writing): several differ from earlier migrations in this repo --
-- detect_idling_notifications and within_check_window were never committed,
-- check_in rejects low accuracy, record_location_ping honours
-- auto_checkout_enabled. This file is the source of truth for what it touches.
--
-- 1. Forgotten clock-outs (39 of 181 live sessions ran past midnight). The
--    auto clock-out only ran from the open app, needed a GPS fix and compared
--    time of day, so it never fired after midnight; and `end + grace` as a
--    `time` wraps (17:00 + 480 min = 01:00). Now:
--      * app.session_work_end / app.session_close_deadline: the session's own
--        date + the person's end (+ grace) as a timestamptz -- no wrap, right
--        across midnight.
--      * app._auto_close_session: the one place the close rules live (the
--        existing ones: mid-visit = later of end / visit start + 60 min,
--        otherwise last visit checkout rounded up a quarter hour), but only
--        once the close time has been reached, so it never writes a future time.
--      * app.auto_clock_out_stale(): sweeps every open session; run every 5
--        minutes by pg_cron (plain SQL, no secrets). No GPS needed -- it uses
--        the session's last visit position when there is one.
--      * app.enforce_working_hours (the app's own check) calls the same helper.
--      * app.within_clock_in_window: wrap-safe early minutes.
-- 2. One idle detector. The idle alert is now inside app.attendance_alerts
--    only (it reaches managers): inside the person's shift, on a working day,
--    not on approved leave, only after the session's first completed visit,
--    once per idle stretch. The duplicate cron job and function
--    (detect_idling_notifications) are removed.
-- 3. app.notify_late_clock_in skips flexible days and approved leave, and
--    doesn't repeat a "late" alert already raised that day.
-- 4. Customer check-in/out window (was 07:00-20:00 hard-coded) is now
--    app_settings.check_window_start / check_window_end.
-- 5. app.record_location_ping ignores low-accuracy pings for auto check-out.
-- 6. app._close_visit flags SHORT_VISIT when a visit is shorter than
--    app_settings.short_visit_threshold_minutes (0 = off).

-- ---------------------------------------------------------------------------
-- Settings: check-in/out window
-- ---------------------------------------------------------------------------
alter table public.app_settings
  add column check_window_start time not null default '07:00',
  add column check_window_end   time not null default '20:00',
  add constraint app_settings_check_window_order check (check_window_end > check_window_start);

comment on column public.app_settings.check_window_start is 'Customer check-in / check-out opens at this time (Asia/Phnom_Penh).';
comment on column public.app_settings.check_window_end   is 'Customer check-in / check-out closes at this time (Asia/Phnom_Penh).';

create or replace function app.within_check_window()
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
begin
  select check_window_start, check_window_end into v_start, v_end from public.app_settings limit 1;
  return v_local >= coalesce(v_start, time '07:00') and v_local < coalesce(v_end, time '20:00');
end;
$function$;

-- ---------------------------------------------------------------------------
-- Clock-in window: wrap-safe early minutes
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
  select c.allow_early_clockin_minutes into v_early from app.clock_window(auth.uid()) c;
  v_start := coalesce(v_start, time '08:00');
  v_end := coalesce(v_end, time '17:00');
  v_early := coalesce(v_early, 0);

  -- Minutes since midnight, so an early window can't wrap below 00:00.
  return extract(epoch from v_local) / 60 >= extract(epoch from v_start) / 60 - v_early
     and v_local < v_end;
end;
$function$;

-- ---------------------------------------------------------------------------
-- An automatic clock-out may have no position
-- ---------------------------------------------------------------------------
-- attendance_clockout_fields_ck demanded a clock-out latitude (and a selfie
-- unless auto) on every closed session. The sweep runs with the app closed, so
-- it has no GPS fix of its own; an automatic clock-out may now be recorded
-- without one rather than inventing a position. Manual clock-outs still need
-- both. Only loosens the rule, so every existing row still satisfies it.
alter table public.attendance drop constraint attendance_clockout_fields_ck;
alter table public.attendance add constraint attendance_clockout_fields_ck check (
  (clock_out_at is null and clock_out_latitude is null and clock_out_selfie_path is null)
  or (clock_out_at is not null
      and (clock_out_latitude is not null or auto_clocked_out)
      and (clock_out_selfie_path is not null or auto_clocked_out))
);

-- ---------------------------------------------------------------------------
-- When a session's day ends, as a timestamptz
-- ---------------------------------------------------------------------------
-- The person's end of day (app.work_day) on the date the session started.
create function app.session_work_end(p_user uuid, p_clock_in timestamptz)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(
    p_clock_in,
    ((p_clock_in at time zone 'Asia/Phnom_Penh')::date + coalesce(w.end_time, time '17:00')) at time zone 'Asia/Phnom_Penh'
  )
  from app.work_day(p_user, (p_clock_in at time zone 'Asia/Phnom_Penh')::date) w;
$$;

-- End of day plus the person's auto clock-out delay: when a still-open session
-- is overdue. Timestamp arithmetic, so a long delay can't wrap past midnight.
create function app.session_close_deadline(p_user uuid, p_clock_in timestamptz)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select app.session_work_end(p_user, p_clock_in) + make_interval(mins => c.auto_clockout_grace_minutes)
    from app.clock_window(p_user) c;
$$;

comment on function app.session_work_end is
  'p_user''s end of day (app.work_day) on the local date p_clock_in falls on, as a timestamptz; never before p_clock_in.';
comment on function app.session_close_deadline is
  'session_work_end plus the person''s auto clock-out delay (app.clock_window): once now() passes it, a still-open session is overdue.';

-- ---------------------------------------------------------------------------
-- Closing an overdue session: the one place the rules live
-- ---------------------------------------------------------------------------
-- Returns the same shape the app already reads from enforce_working_hours.
-- Does nothing (auto_clocked_out = false) until the session is overdue and the
-- close time has actually been reached, so it never records a future time.
-- Security definer so the cron sweep and the signed-in person's own check use
-- the same code; a signed-in caller can only close their own session.
create function app._auto_close_session(
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
  v_open_visit    public.visits;
  v_closed_visit  public.visits;
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

  select * into v_open_visit
    from public.visits
   where user_id = v_open.user_id and checked_out_at is null and cancelled_at is null;

  if v_open_visit.id is not null then
    -- Still mid-visit when the day ended: close the visit and the session at
    -- the later of the end of day or 60 minutes after the visit started.
    -- Wait until that time has arrived rather than record a future one.
    v_close_at := greatest(v_work_end, v_open_visit.checked_in_at + interval '60 minutes');
    if v_close_at > p_now then
      return jsonb_build_object('auto_clocked_out', false);
    end if;

    select * into v_closed_visit
      from app._close_visit(v_open_visit.id, p_latitude, p_longitude, p_accuracy, 'AUTO_CHECKOUT_WORKING_HOURS_END', p_checked_out_at => v_close_at);
  else
    -- Otherwise the last visit checked out this session (else the end of day),
    -- rounded up to the next quarter hour, never later than now.
    select max(checked_out_at) into v_last_checkout
      from public.visits
     where attendance_id = v_open.id and checked_out_at is not null and cancelled_at is null;

    v_close_at := app._round_up_to_quarter_hour(coalesce(v_last_checkout, v_work_end));
    v_close_at := greatest(least(v_close_at, p_now), v_open.clock_in_at);
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

-- The app's own check (every few minutes while it is open) -- same rules.
create or replace function app.enforce_working_hours(p_latitude numeric, p_longitude numeric, p_accuracy numeric default null::numeric)
returns jsonb
language plpgsql
set search_path to ''
as $function$
declare
  v_me       uuid := auth.uid();
  v_override text := nullif(current_setting('higtest.now', true), '');
  v_at       timestamptz := coalesce(v_override::timestamptz, now());
  v_open     uuid;
begin
  if v_me is null then
    raise exception 'Not signed in' using errcode = 'insufficient_privilege';
  end if;

  select id into v_open from public.attendance where user_id = v_me and clock_out_at is null;
  if v_open is null then
    return jsonb_build_object('auto_clocked_out', false);
  end if;

  return app._auto_close_session(v_open, p_latitude, p_longitude, p_accuracy, v_at);
end;
$function$;

-- Sweep: close every overdue open session, with or without the app open.
create function app.auto_clock_out_stale(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  r       record;
  v_lat   numeric;
  v_lng   numeric;
  v_res   jsonb;
  v_count integer := 0;
begin
  for r in select a.id from public.attendance a where a.clock_out_at is null loop
    begin
      -- No GPS from a closed app: use where the session's last visit was.
      select coalesce(v.out_latitude, v.in_latitude), coalesce(v.out_longitude, v.in_longitude)
        into v_lat, v_lng
        from public.visits v
       where v.attendance_id = r.id and v.cancelled_at is null
       order by coalesce(v.checked_out_at, v.checked_in_at) desc
       limit 1;

      v_res := app._auto_close_session(r.id, v_lat, v_lng, null, p_now);
      if (v_res->>'auto_clocked_out')::boolean then
        v_count := v_count + 1;
      end if;
    exception when others then
      raise warning 'auto_clock_out_stale: session % skipped: %', r.id, sqlerrm;
    end;
  end loop;
  return v_count;
end;
$function$;

comment on function app.auto_clock_out_stale is
  'Closes every open attendance session past its end of day + the person''s auto clock-out delay (app._auto_close_session). Returns how many it closed. Run every 5 minutes by pg_cron.';

revoke execute on function app.session_work_end(uuid, timestamptz) from public;
revoke execute on function app.session_close_deadline(uuid, timestamptz) from public;
revoke execute on function app._auto_close_session(uuid, numeric, numeric, numeric, timestamptz) from public;
revoke execute on function app.auto_clock_out_stale(timestamptz) from public;
grant execute on function app.session_work_end(uuid, timestamptz) to authenticated, service_role;
grant execute on function app.session_close_deadline(uuid, timestamptz) to authenticated, service_role;
grant execute on function app._auto_close_session(uuid, numeric, numeric, numeric, timestamptz) to authenticated, service_role;
grant execute on function app.auto_clock_out_stale(timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- Visits: SHORT_VISIT flag
-- ---------------------------------------------------------------------------
create or replace function app._close_visit(p_visit uuid, p_latitude numeric, p_longitude numeric, p_accuracy numeric, p_auto_flag text, p_visit_type_id uuid DEFAULT NULL::uuid, p_visit_status_id uuid DEFAULT NULL::uuid, p_order_status_id uuid DEFAULT NULL::uuid, p_payment_status_id uuid DEFAULT NULL::uuid, p_next_appointment timestamp with time zone DEFAULT NULL::timestamp with time zone, p_remarks text DEFAULT NULL::text, p_checked_out_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 returns public.visits
 language plpgsql
 set search_path to ''
as $function$
declare
  v_visit   public.visits;
  v_radius  integer;
  v_max_acc integer;
  v_short   integer;
  v_lat     numeric;
  v_lng     numeric;
  v_dist    integer;
  v_flags   text[];
  v_out_at  timestamptz;
begin
  select v.* into v_visit
    from public.visits v
   where v.id = p_visit and v.checked_out_at is null and v.cancelled_at is null;

  if v_visit.id is null then
    return null;
  end if;

  select checkin_radius_m, max_location_accuracy_m, short_visit_threshold_minutes
    into v_radius, v_max_acc, v_short
    from public.app_settings limit 1;
  v_radius := coalesce(v_radius, 200);
  v_max_acc := coalesce(v_max_acc, 100);
  v_out_at := coalesce(p_checked_out_at, now());

  if v_visit.customer_id is not null then
    select c.latitude, c.longitude into v_lat, v_lng
      from public.customers c where c.id = v_visit.customer_id;
  end if;

  if v_lat is not null and p_latitude is not null then
    v_dist := round(app.metres_between(p_latitude, p_longitude, v_lat, v_lng));
  end if;

  v_flags := v_visit.flags;
  if p_accuracy is not null and p_accuracy > v_max_acc and not (v_flags @> array['LOW_LOCATION_ACCURACY']) then
    v_flags := array_append(v_flags, 'LOW_LOCATION_ACCURACY');
  end if;
  if p_auto_flag is not null and not (v_flags @> array[p_auto_flag]) then
    v_flags := array_append(v_flags, p_auto_flag);
  end if;
  if coalesce(v_short, 0) > 0
     and v_out_at - v_visit.checked_in_at < make_interval(mins => v_short)
     and not (v_flags @> array['SHORT_VISIT']) then
    v_flags := array_append(v_flags, 'SHORT_VISIT');
  end if;

  update public.visits
     set checked_out_at = v_out_at,
         out_latitude = p_latitude,
         out_longitude = p_longitude,
         out_accuracy_m = p_accuracy,
         checkout_distance_m = v_dist,
         checkout_out_of_range = coalesce(v_dist > v_radius, false),
         auto_closed = (p_auto_flag is not null),
         flags = v_flags,
         visit_type_id = coalesce(p_visit_type_id, visit_type_id),
         visit_status_id = coalesce(p_visit_status_id, visit_status_id),
         order_status_id = coalesce(p_order_status_id, order_status_id),
         payment_status_id = coalesce(p_payment_status_id, payment_status_id),
         next_appointment = coalesce(p_next_appointment, next_appointment),
         remarks = coalesce(p_remarks, remarks)
   where id = p_visit and checked_out_at is null and cancelled_at is null
  returning * into v_visit;

  return v_visit;
end;
$function$;

-- ---------------------------------------------------------------------------
-- Auto check-out by GPS ping: ignore pings too inaccurate to trust
-- ---------------------------------------------------------------------------
create or replace function app.record_location_ping(p_visit uuid, p_latitude numeric, p_longitude numeric, p_accuracy numeric DEFAULT NULL::numeric)
 returns jsonb
 language plpgsql
 set search_path to ''
as $function$
declare
  v_me           uuid := auth.uid();
  v_visit        public.visits;
  v_dist         integer;
  v_out          boolean;
  v_auto_enabled boolean;
  v_max_acc      integer;
  v_ping         public.location_pings;
  v_closed       public.visits;
begin
  if v_me is null then
    raise exception 'Not signed in' using errcode = 'insufficient_privilege';
  end if;

  select * into v_visit
    from public.visits
   where id = p_visit and user_id = v_me and checked_out_at is null and cancelled_at is null;

  if v_visit.id is null then
    raise exception 'That visit is not open' using errcode = 'no_data_found';
  end if;

  if v_visit.in_latitude is not null and p_latitude is not null then
    v_dist := round(app.metres_between(p_latitude, p_longitude, v_visit.in_latitude, v_visit.in_longitude));
  end if;
  v_out := coalesce(v_dist > v_visit.radius_m, false);

  insert into public.location_pings (visit_id, user_id, latitude, longitude, accuracy_m, distance_m, out_of_range)
  values (p_visit, v_me, p_latitude, p_longitude, p_accuracy, v_dist, v_out)
  returning * into v_ping;

  select auto_checkout_enabled, max_location_accuracy_m into v_auto_enabled, v_max_acc from public.app_settings limit 1;
  v_auto_enabled := coalesce(v_auto_enabled, true);
  v_max_acc := coalesce(v_max_acc, 100);

  -- A fix too rough to trust (a +/-500 m reading) must not close a visit.
  if v_out and v_auto_enabled and (p_accuracy is null or p_accuracy <= v_max_acc) then
    select * into v_closed from app._close_visit(p_visit, p_latitude, p_longitude, p_accuracy, 'AUTO_CHECKOUT_OUTSIDE_RADIUS');
  end if;

  return jsonb_build_object(
    'ping', to_jsonb(v_ping),
    'auto_checked_out', (v_closed.id is not null),
    'visit', to_jsonb(v_closed)
  );
end;
$function$;

-- ---------------------------------------------------------------------------
-- Late clock-in notification: skip leave / flexible days, no repeats
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
  v_local_date   date := (NEW.clock_in_at at time zone 'Asia/Phnom_Penh')::date;
  v_minutes_late numeric;
begin
  select w.start_time, w.is_working into v_start, v_working
    from app.work_day(NEW.user_id, v_local_date) w;
  select late_clockin_threshold_minutes into v_threshold from public.app_settings limit 1;

  if not coalesce(v_working, true) then
    return NEW;
  end if;

  -- Flexible (travel) people have no fixed start; approved leave is not late.
  if app.day_off_mode(NEW.user_id, v_local_date) = 'flexible' then
    return NEW;
  end if;
  if exists (
    select 1 from public.leave_requests lr
     where lr.user_id = NEW.user_id and lr.status = 'approved'
       and v_local_date between lr.start_date and lr.end_date
  ) then
    return NEW;
  end if;

  if exists (
    select 1 from public.attendance a2
    where a2.user_id = NEW.user_id
      and a2.id <> NEW.id
      and (a2.clock_in_at at time zone 'Asia/Phnom_Penh')::date = v_local_date
      and a2.clock_in_at < NEW.clock_in_at
  ) then
    return NEW;
  end if;

  -- Already told them today (e.g. the "has not clocked in yet" alert).
  if exists (
    select 1 from public.notifications ex
     where ex.user_id = NEW.user_id and ex.kind = 'late_clock_in'
       and (ex.occurred_at at time zone 'Asia/Phnom_Penh')::date = v_local_date
  ) then
    return NEW;
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
-- Manager alerts: the one idle detector
-- ---------------------------------------------------------------------------
-- Same as the live function (0091 + 0100 + 0109) except `idling`: inside the
-- shift on a working day, not on approved leave, after the session's first
-- completed visit, once per idle stretch.
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
           u.full_name || ' has been idle (no active visit) for over ' || s.idle_alert_threshold_minutes || ' minutes.',
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
       and now() - lv.last_out >= make_interval(mins => s.idle_alert_threshold_minutes)
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

-- ---------------------------------------------------------------------------
-- Each person's own work day, for the team screens
-- ---------------------------------------------------------------------------
-- The team screens used the signed-in viewer's start time for everyone. This
-- returns every person's own hours and unpaid break on one date (team or
-- company schedule, flexible days, holidays -- app.work_day) for the people the
-- caller may see attendance for, and the caller themselves.
create function app.team_work_days(p_date date)
returns table (
  user_id       uuid,
  is_working    boolean,
  start_time    time,
  end_time      time,
  break_minutes integer,
  break_paid    boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id, w.is_working, w.start_time, w.end_time, w.break_minutes, w.break_paid
    from public.users u
    cross join lateral app.work_day(u.id, p_date) w
   where u.status = 'active'
     and (u.id = auth.uid() or app.can('attendance', 'view', u.id));
$$;

comment on function app.team_work_days is
  'Each active person''s own work day on p_date (app.work_day) for the people the caller may view attendance for, plus the caller.';

create function public.team_work_days(p_date date default null)
returns table (
  user_id       uuid,
  is_working    boolean,
  start_time    time,
  end_time      time,
  break_minutes integer,
  break_paid    boolean
)
language sql
stable
set search_path = ''
as $$
  select * from app.team_work_days(coalesce(p_date, (now() at time zone 'Asia/Phnom_Penh')::date));
$$;

revoke execute on function app.team_work_days(date) from public;
revoke execute on function public.team_work_days(date) from public;
grant execute on function app.team_work_days(date) to authenticated;
grant execute on function public.team_work_days(date) to authenticated;

-- ---------------------------------------------------------------------------
-- Scheduling
-- ---------------------------------------------------------------------------
-- The sweep every 5 minutes; the duplicate idle detector (live-only, never in
-- this repo) goes away, along with its job.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('auto-clock-out-stale', '*/5 * * * *', 'select app.auto_clock_out_stale();');
    if exists (select 1 from cron.job where jobname = 'detect-idling-notifications') then
      perform cron.unschedule('detect-idling-notifications');
    end if;
  end if;
end;
$$;

drop function if exists app.detect_idling_notifications();
