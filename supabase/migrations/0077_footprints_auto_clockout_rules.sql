-- Footprints: refine the working-hours auto clock-out (app.enforce_working_hours,
-- see 0066_footprints_attendance.sql) so the recorded clock-out time reflects
-- when the person actually stopped working, not just whenever the periodic
-- background check happened to fire (which can lag by up to
-- location_ping_interval_minutes).
--
-- Two cases, decided by whether a visit is still open when working hours end:
--
--   1. No open visit: the clock-out time is the last visit checked out this
--      attendance session, rounded UP to the next quarter hour (never left
--      as-is even if already exactly on one -- always strictly the next
--      15-minute mark). Falls back to "now" (also rounded up) if no visit
--      was checked out this session at all.
--   2. An open visit: both the visit and the attendance session close at
--      the LATER of today's work_end_time or 60 minutes after the visit
--      started -- whichever is greater, so a visit that started right
--      before hours end still gets a full hour before being force-closed.
--
-- app._close_visit gets a new trailing p_checked_out_at param (default
-- null -> now(), unchanged for its other two call sites: app.clock_out's
-- own auto-checkout-on-clock-out, and app.record_location_ping's
-- radius-breach auto-checkout) so enforce_working_hours can pass the
-- computed time above instead of the moment the check fires. Adding a
-- parameter changes the function's argument-type signature, so this needs
-- DROP + CREATE, not a plain CREATE OR REPLACE (same
-- Postgres-function-overload gotcha 0067/0068 already ran into) --
-- otherwise the old 11-arg version would stick around as a second, unused
-- overload instead of being replaced.

drop function if exists app._close_visit(uuid, numeric, numeric, numeric, text, uuid, uuid, uuid, uuid, timestamptz, text);

create function app._close_visit(
  p_visit uuid,
  p_latitude numeric,
  p_longitude numeric,
  p_accuracy numeric,
  p_auto_flag text, -- null for a manual check-out, otherwise the flag to add
  p_visit_type_id uuid default null,
  p_visit_status_id uuid default null,
  p_order_status_id uuid default null,
  p_payment_status_id uuid default null,
  p_next_appointment timestamptz default null,
  p_remarks text default null,
  p_checked_out_at timestamptz default null -- null -> now(); an explicit auto-clockout close time otherwise
)
returns public.visits
language plpgsql
set search_path to ''
as $function$
declare
  v_visit   public.visits;
  v_radius  integer;
  v_max_acc integer;
  v_lat     numeric;
  v_lng     numeric;
  v_dist    integer;
  v_flags   text[];
begin
  select v.* into v_visit
    from public.visits v
   where v.id = p_visit and v.checked_out_at is null and v.cancelled_at is null;

  if v_visit.id is null then
    return null;
  end if;

  select checkin_radius_m, max_location_accuracy_m into v_radius, v_max_acc
    from public.app_settings limit 1;
  v_radius := coalesce(v_radius, 200);
  v_max_acc := coalesce(v_max_acc, 100);

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

  update public.visits
     set checked_out_at = coalesce(p_checked_out_at, now()),
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

-- Small, pure, unit-testable-by-SELECT helper for rule 1 above: always
-- strictly the NEXT quarter-hour mark, even when p_ts already lands exactly
-- on one (e.g. 17:30:00 -> 17:45:00, not 17:30:00). 900 seconds = 15
-- minutes; Asia/Phnom_Penh's fixed UTC+7 offset (no DST, a whole multiple
-- of 15 minutes) means aligning to Unix-epoch quarter-hour boundaries is
-- the same as aligning to Phnom Penh wall-clock quarter-hour boundaries.
create or replace function app._round_up_to_quarter_hour(p_ts timestamptz)
returns timestamptz
language sql
immutable
set search_path to ''
as $function$
  select to_timestamp(floor(extract(epoch from p_ts) / 900) * 900 + 900);
$function$;

create or replace function app.enforce_working_hours(p_latitude numeric, p_longitude numeric, p_accuracy numeric default null)
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

  select work_end_time, auto_clockout_grace_minutes into v_end, v_grace from public.app_settings limit 1;
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
