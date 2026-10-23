-- Footprints: simpler clock in/out and check in/out rules.
--
--  1. Check-in radius 50 m -> 100 m and the GPS accuracy limit 50 m -> 100 m: one number
--     for both, so a 55 m reading at a shop door no longer blocks anyone.
--  2. Remote Salesperson clocks in and out anywhere (their Office rule is removed).
--  3. A visit is auto-checked-out for leaving only once the person is well outside
--     (twice the radius); between the radius and that it is just marked out of range.
--  4. A manual clock-out ends an open visit at the clock-out time (not check-in + the
--     forgotten-visit cap); automatic closes keep the cap.
--  5. Clocking out before the end of the person's day with no approved leave is flagged
--     EARLY_CLOCK_OUT (never blocked).
--  6. The check-out time-window error follows the check-window settings instead of
--     a hardcoded "7:00 AM and 8:00 PM".
-- app.record_location_ping, app.clock_out and app.check_out are patched from their LIVE
-- definitions (read with pg_get_functiondef).

update public.app_settings set checkin_radius_m = 100, max_location_accuracy_m = 100;

delete from public.clock_location_rules
 where role_id = (select id from public.roles where key = 'remote_sales');

-- 3. Auto check-out only well outside the radius
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
  -- Past the radius the ping is only marked out of range; the visit is closed once the person
  -- is well outside it (twice the radius), so GPS drift next to the shop doesn't end the visit.
  if coalesce(v_dist > v_visit.radius_m * 2, false) and v_auto_enabled and (p_accuracy is null or p_accuracy <= v_max_acc) then
    select * into v_closed from app._close_visit(p_visit, p_latitude, p_longitude, p_accuracy, 'AUTO_CHECKOUT_OUTSIDE_RADIUS');
  end if;

  return jsonb_build_object(
    'ping', to_jsonb(v_ping),
    'auto_checked_out', (v_closed.id is not null),
    'visit', to_jsonb(v_closed)
  );
end;
$function$;

-- 4 and 5. Clock-out
create or replace function app.clock_out(p_latitude numeric, p_longitude numeric, p_accuracy numeric, p_selfie_path text)
 returns jsonb
 language plpgsql
 set search_path to ''
as $function$
declare
  v_me          uuid := auth.uid();
  v_open        public.attendance;
  v_max_acc     integer;
  v_flags       text[];
  v_visit_id    uuid;
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
  -- rather than blocking the clock-out. The visit ends when the person
  -- clocks out; only an automatic close (nobody there to say when) uses the
  -- forgotten-visit cap.
  select id into v_visit_id
    from public.visits
   where user_id = v_me and checked_out_at is null and cancelled_at is null;

  if v_visit_id is not null then
    select * into v_closed
      from app._close_visit(v_visit_id, p_latitude, p_longitude, p_accuracy, 'AUTO_CHECKOUT_CLOCK_OUT');
  end if;

  select max_location_accuracy_m into v_max_acc from public.app_settings limit 1;
  v_max_acc := coalesce(v_max_acc, 100);

  v_flags := v_open.flags;
  if p_accuracy is not null and p_accuracy > v_max_acc and not (v_flags @> array['LOW_LOCATION_ACCURACY']) then
    v_flags := array_append(v_flags, 'LOW_LOCATION_ACCURACY');
  end if;

  -- Leaving before the end of the person's day with no approved leave is flagged, never blocked.
  if now() < app.session_work_end(v_me, v_open.clock_in_at)
     and not exists (
       select 1 from public.leave_requests lr
        where lr.user_id = v_me and lr.status = 'approved'
          and (now() at time zone 'Asia/Phnom_Penh')::date between lr.start_date and lr.end_date)
     and not (v_flags @> array['EARLY_CLOCK_OUT']) then
    v_flags := array_append(v_flags, 'EARLY_CLOCK_OUT');
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

-- 6. Check-out message
create or replace function app.check_out(p_visit uuid, p_latitude numeric, p_longitude numeric, p_accuracy numeric DEFAULT NULL::numeric, p_visit_type_id uuid DEFAULT NULL::uuid, p_visit_status_id uuid DEFAULT NULL::uuid, p_order_status_id uuid DEFAULT NULL::uuid, p_payment_status_id uuid DEFAULT NULL::uuid, p_next_appointment timestamp with time zone DEFAULT NULL::timestamp with time zone, p_remarks text DEFAULT NULL::text, p_order_amount_usd numeric DEFAULT NULL::numeric, p_collected_usd numeric DEFAULT NULL::numeric)
 returns public.visits
 language plpgsql
 set search_path to ''
as $function$
declare
  v_visit     public.visits;
  v_win_start time;
  v_win_end   time;
begin
  if not app.within_check_window() then
    select check_window_start, check_window_end into v_win_start, v_win_end from public.app_settings limit 1;
    raise exception 'Check-out is only allowed between % and %.',
      to_char(coalesce(v_win_start, time '07:00'), 'HH24:MI'), to_char(coalesce(v_win_end, time '20:00'), 'HH24:MI')
      using errcode = 'check_violation';
  end if;

  select * into v_visit from app._close_visit(
    p_visit, p_latitude, p_longitude, p_accuracy, null,
    p_visit_type_id, p_visit_status_id, p_order_status_id, p_payment_status_id,
    p_next_appointment, p_remarks
  );

  if v_visit.id is null then
    raise exception 'That visit is not open' using errcode = 'no_data_found';
  end if;

  if p_order_amount_usd is not null or p_collected_usd is not null then
    update public.visits
       set order_amount_usd = coalesce(p_order_amount_usd, order_amount_usd),
           collected_usd = coalesce(p_collected_usd, collected_usd)
     where id = v_visit.id
    returning * into v_visit;
  end if;

  return v_visit;
end;
$function$;
