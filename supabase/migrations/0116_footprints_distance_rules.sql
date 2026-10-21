-- Footprints: the scoring and flag rules by distance.
--
-- Three rules, each with its own switch and numbers on app_settings:
--  1. Travel deduction (effectiveness score): on a day that travels more than
--     travel_deduction_min_km and has a visit outside the home city, every full
--     travel_deduction_step_km takes travel_deduction_minutes off the paid
--     hours the score is measured against. "Home city" is the circle
--     home_city_latitude/longitude/radius_km (Phnom Penh by default).
--     Replaces the "+1 active hour per 50 km" bonus. Calculated in the app.
--  2. Late first visit: when the first visit is more than first_visit_far_km from
--     where the person clocked in, the deadline moves out by
--     first_visit_far_extra_minutes (app.check_in sets LATE_FIRST_VISIT).
--  3. Idle gaps: when a gap's travel (previous check-out to the next check-in)
--     is more than idle_far_km, the limit is idle_far_window_minutes plus
--     idle_far_minutes_per_step per full idle_far_step_km, never below the normal
--     limit; a gap overlapping the lunch window still needs the lunch limit if
--     that is longer. app.idle_threshold_minutes takes the distance.
--
-- The manager alert has no live position to measure from, so it passes no
-- distance and keeps the normal limit; the app applies the distance rule to
-- every closed gap (day bar, timeline, map, reports).

alter table public.app_settings
  add column travel_deduction_enabled    boolean not null default true,
  add column travel_deduction_min_km     integer not null default 25  check (travel_deduction_min_km between 0 and 1000),
  add column travel_deduction_step_km    integer not null default 10  check (travel_deduction_step_km between 1 and 500),
  add column travel_deduction_minutes    integer not null default 10  check (travel_deduction_minutes between 0 and 240),
  add column home_city_latitude          numeric not null default 11.5564,
  add column home_city_longitude         numeric not null default 104.9282,
  add column home_city_radius_km         integer not null default 15  check (home_city_radius_km between 1 and 200),
  add column first_visit_far_enabled     boolean not null default true,
  add column first_visit_far_km          integer not null default 10  check (first_visit_far_km between 1 and 500),
  add column first_visit_far_extra_minutes integer not null default 30 check (first_visit_far_extra_minutes between 0 and 240),
  add column idle_far_enabled            boolean not null default true,
  add column idle_far_km                 integer not null default 10  check (idle_far_km between 1 and 500),
  add column idle_far_step_km            integer not null default 10  check (idle_far_step_km between 1 and 500),
  add column idle_far_minutes_per_step   integer not null default 10  check (idle_far_minutes_per_step between 0 and 240),
  add column idle_far_window_minutes     integer not null default 30  check (idle_far_window_minutes between 0 and 240);

comment on column public.app_settings.travel_deduction_min_km is 'Travel deduction applies on a day travelling more than this many km with a visit outside the home city.';
comment on column public.app_settings.home_city_radius_km is 'Visits within this many km of home_city_latitude/longitude are in the home city (Phnom Penh).';
comment on column public.app_settings.first_visit_far_km is 'A first visit further than this from the clock-in point gets first_visit_far_extra_minutes more before it is late.';
comment on column public.app_settings.idle_far_km is 'A gap whose travel is longer than this uses the idle_far_* limit instead of the normal one.';

-- ---------------------------------------------------------------------------
-- Idle threshold, with the distance travelled across the gap
-- ---------------------------------------------------------------------------
drop function if exists app.idle_threshold_minutes(timestamptz, timestamptz);

create function app.idle_threshold_minutes(p_from timestamptz, p_to timestamptz, p_distance_m numeric default 0)
returns integer
language sql
stable
set search_path = ''
as $$
  select greatest(
           case
             when s.idle_far_enabled and coalesce(p_distance_m, 0) > s.idle_far_km * 1000
             then greatest(s.idle_alert_threshold_minutes,
                           s.idle_far_window_minutes + s.idle_far_minutes_per_step * floor(p_distance_m / 1000.0 / s.idle_far_step_km)::int)
             else s.idle_alert_threshold_minutes
           end,
           case
             when (p_from at time zone 'Asia/Phnom_Penh')::date = (p_to at time zone 'Asia/Phnom_Penh')::date
              and (p_from at time zone 'Asia/Phnom_Penh')::time < s.lunch_window_end
              and (p_to   at time zone 'Asia/Phnom_Penh')::time > s.lunch_window_start
             then s.lunch_idle_threshold_minutes
             else 0
           end)
    from public.app_settings s
   limit 1;
$$;

comment on function app.idle_threshold_minutes is
  'Minutes a gap from p_from to p_to must exceed to be flagged idle: the normal limit, or when the gap travelled further than idle_far_km the far limit (window + minutes per step); the lunch limit when it overlaps the lunch window and is longer.';

revoke execute on function app.idle_threshold_minutes(timestamptz, timestamptz, numeric) from public;
grant execute on function app.idle_threshold_minutes(timestamptz, timestamptz, numeric) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Check-in: LATE_FIRST_VISIT with the far window
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
  v_far_on     boolean;
  v_far_km     integer;
  v_far_extra  integer;
  v_ci_lat     numeric;
  v_ci_lng     numeric;
  v_from_in    numeric;
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

  select id, clock_in_latitude, clock_in_longitude into v_attendance, v_ci_lat, v_ci_lng
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

  select checkin_radius_m, max_location_accuracy_m, first_visit_deadline,
         first_visit_far_enabled, first_visit_far_km, first_visit_far_extra_minutes
    into v_radius, v_max_acc, v_deadline, v_far_on, v_far_km, v_far_extra
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

  -- The first customer visit of the day, after the deadline. When the first stop is more
  -- than first_visit_far_km from where the person clocked in, the deadline moves out by
  -- first_visit_far_extra_minutes (the drive explains part of it).
  if v_number = 1 then
    v_deadline := coalesce(v_deadline, time '10:00');
    if coalesce(v_far_on, false) and p_latitude is not null and v_ci_lat is not null then
      v_from_in := app.metres_between(v_ci_lat, v_ci_lng, p_latitude, p_longitude);
      if v_from_in > coalesce(v_far_km, 10) * 1000 then
        v_deadline := v_deadline + make_interval(mins => coalesce(v_far_extra, 30));
      end if;
    end if;
    if (now() at time zone 'Asia/Phnom_Penh')::time > v_deadline then
      v_flags := array_append(v_flags, 'LATE_FIRST_VISIT');
    end if;
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
