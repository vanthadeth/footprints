-- Footprints: sales trip fuel is typed by the requester (0104).
--
-- 0103 costed fuel/transport as route km x app_settings.trip_km_rate. Now the
-- requester types the fuel amount they need (one vehicle; empty = $0) and the
-- route km is only a guide. est_total = days x people x day_rate +
-- room_nights x night_rate + fuel_amount + special_total.
--
-- sales_trips.km_rate is kept for trips sent before 0104 (their fuel is
-- backfilled from it) and is 0 from now on. app_settings.trip_km_rate is no
-- longer read by the app.

alter table public.sales_trips
  add column fuel_amount numeric(10,2) not null default 0 check (fuel_amount between 0 and 100000);

update public.sales_trips set fuel_amount = round(total_km * km_rate, 2) where km_rate > 0;

comment on column public.sales_trips.fuel_amount is 'Fuel / transport the requester asked for (USD, one vehicle). Trips sent before 0104: route km x km rate.';
comment on column public.sales_trips.km_rate is 'Fuel rate per km used before 0104; 0 for trips sent since (fuel is typed, see fuel_amount).';
comment on column public.app_settings.trip_km_rate is 'Unused since 0104: trip fuel is typed by the requester.';
comment on table public.sales_trips is
  'A province sales trip request. Rates are a copy of app_settings at send time; est_total = days x people x day_rate + room_nights x night_rate + fuel_amount + special_total. Written only via request/decide/cancel_sales_trip.';

-- ---------------------------------------------------------------- request

drop function public.request_sales_trip(uuid, date, jsonb, uuid[], jsonb, text);
drop function app.request_sales_trip(uuid, date, jsonb, uuid[], jsonb, text);

-- p_days: [{ "provinces": ["TKO","KMP"], "night": "KMP", "rooms": 2, "km": 175 }, ...] (night null on the last day).
-- p_special: [{ "reason": "Ferry / boat", "note": "...", "amount": 24 }, ...].
-- p_trip_id: re-send a trip of yours that is pending or had changes asked.
-- p_fuel: fuel / transport the requester asks for (null or omitted = 0).
create function app.request_sales_trip(
  p_trip_id  uuid,
  p_start    date,
  p_days     jsonb,
  p_people   uuid[],
  p_special  jsonb,
  p_note     text default null,
  p_fuel     numeric default 0
)
returns public.sales_trips
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_me       uuid := auth.uid();
  v_set      public.app_settings;
  v_n        integer := coalesce(jsonb_array_length(p_days), 0);
  v_end      date;
  v_people   uuid[];
  v_count    integer;
  v_day      jsonb;
  v_i        integer;
  v_provs    text[];
  v_night    text;
  v_rooms    integer;
  v_km       integer;
  v_total_km integer := 0;
  v_rn       integer := 0;
  v_special  numeric := 0;
  v_line     jsonb;
  v_row      public.sales_trips;
  v_leaves   timestamptz;
  v_fuel     numeric := round(coalesce(p_fuel, 0), 2);
begin
  if not app.can('sales_trip', 'add', v_me) then
    raise exception 'insufficient_privilege' using errcode = 'insufficient_privilege', detail = 'You can’t request sales trips.';
  end if;
  select * into v_set from public.app_settings limit 1;

  if v_n < 1 or v_n > 31 then
    raise exception 'invalid_input' using detail = 'A trip is 1 to 31 days.';
  end if;
  v_end := p_start + (v_n - 1);

  v_leaves := (p_start + v_set.trip_leave_time) at time zone 'Asia/Phnom_Penh';
  if v_leaves - now() < make_interval(hours => v_set.trip_notice_hours) then
    raise exception 'too_soon' using detail = format('Trips must be sent at least %s hours before you leave (%s on day 1).', v_set.trip_notice_hours, to_char(v_set.trip_leave_time, 'HH24:MI'));
  end if;

  -- People: the requester always goes; others must be active users.
  v_people := array(select distinct u from unnest(array_prepend(v_me, coalesce(p_people, '{}'))) u);
  select count(*) into v_count from public.users u where u.id = any (v_people) and u.status = 'active';
  if v_count <> cardinality(v_people) then
    raise exception 'invalid_input' using detail = 'Someone on the trip isn’t an active user.';
  end if;

  if exists (
    select 1 from public.sales_trips t
     where t.user_id = v_me and t.status in ('pending', 'approved')
       and t.id is distinct from p_trip_id
       and t.start_date <= v_end and t.end_date >= p_start
  ) then
    raise exception 'overlapping_trip' using detail = 'This overlaps another trip you have waiting or approved.';
  end if;

  -- Days.
  for v_i in 0 .. v_n - 1 loop
    v_day := p_days -> v_i;
    v_provs := array(select jsonb_array_elements_text(coalesce(v_day -> 'provinces', '[]')));
    if cardinality(v_provs) = 0 then
      raise exception 'invalid_input' using detail = format('Day %s needs at least one province to visit.', v_i + 1);
    end if;
    if exists (select 1 from unnest(v_provs) c where not exists (select 1 from public.geo_provinces g where g.code = c and g.code <> 'GEN')) then
      raise exception 'invalid_input' using detail = format('Day %s has a province that doesn’t exist.', v_i + 1);
    end if;
    v_night := nullif(v_day ->> 'night', '');
    if v_i = v_n - 1 and v_night is not null then
      raise exception 'invalid_input' using detail = 'The last day must end back in Phnom Penh.';
    end if;
    if v_i < v_n - 1 and v_night is null then
      raise exception 'invalid_input' using detail = format('Day %s needs an overnight province.', v_i + 1);
    end if;
    if v_night is not null then
      v_rooms := coalesce((v_day ->> 'rooms')::integer, ceil(cardinality(v_people)::numeric / v_set.trip_people_per_room)::integer);
      if v_rooms < 1 or v_rooms > cardinality(v_people) then
        raise exception 'invalid_input' using detail = format('Day %s: rooms must be between 1 and %s.', v_i + 1, cardinality(v_people));
      end if;
      v_rn := v_rn + v_rooms;
    end if;
    v_km := greatest(coalesce((v_day ->> 'km')::integer, 0), 0);
    v_total_km := v_total_km + v_km;
  end loop;

  -- Special allowance.
  for v_line in select * from jsonb_array_elements(coalesce(p_special, '[]')) loop
    if (v_line ->> 'amount') is null or (v_line ->> 'amount')::numeric < 0 or (v_line ->> 'amount')::numeric > 100000 then
      raise exception 'invalid_input' using detail = 'Each special allowance line needs an amount.';
    end if;
    if v_set.trip_special_reason_required and coalesce(btrim(v_line ->> 'reason'), '') = '' then
      raise exception 'invalid_input' using detail = 'Each special allowance line needs a reason.';
    end if;
    v_special := v_special + (v_line ->> 'amount')::numeric;
  end loop;

  -- Fuel / transport: the amount the requester asks for (one vehicle), not km x rate.
  if v_fuel < 0 or v_fuel > 100000 then
    raise exception 'invalid_input' using detail = 'Fuel must be between $0 and $100,000.';
  end if;

  if p_trip_id is null then
    insert into public.sales_trips (user_id, start_date, end_date, note, total_km, day_rate, night_rate, km_rate, fuel_amount, people_count, room_nights, special_total, est_total)
    values (v_me, p_start, v_end, nullif(btrim(p_note), ''), v_total_km, v_set.trip_day_rate, v_set.trip_night_rate, 0, v_fuel,
            cardinality(v_people), v_rn, v_special,
            v_n * cardinality(v_people) * v_set.trip_day_rate + v_rn * v_set.trip_night_rate + v_fuel + v_special)
    returning * into v_row;
  else
    select * into v_row from public.sales_trips where id = p_trip_id for update;
    if not found or v_row.user_id <> v_me then
      raise exception 'not_found' using detail = 'That trip isn’t yours.';
    end if;
    if v_row.status not in ('pending', 'changes') then
      raise exception 'invalid_state' using detail = 'Only a trip that is waiting or had changes asked can be edited.';
    end if;
    update public.sales_trips
       set start_date = p_start, end_date = v_end, note = nullif(btrim(p_note), ''), status = 'pending', total_km = v_total_km,
           day_rate = v_set.trip_day_rate, night_rate = v_set.trip_night_rate, km_rate = 0, fuel_amount = v_fuel,
           people_count = cardinality(v_people), room_nights = v_rn, special_total = v_special,
           est_total = v_n * cardinality(v_people) * v_set.trip_day_rate + v_rn * v_set.trip_night_rate + v_fuel + v_special,
           decided_by = null, decided_at = null, updated_at = now()
     where id = p_trip_id
     returning * into v_row;
    delete from public.sales_trip_days where trip_id = v_row.id;
    delete from public.sales_trip_people where trip_id = v_row.id;
    delete from public.sales_trip_specials where trip_id = v_row.id;
  end if;

  insert into public.sales_trip_days (trip_id, day_no, day, provinces, night_province, rooms, km)
  select v_row.id, (o.i)::smallint, p_start + (o.i::integer - 1),
         array(select jsonb_array_elements_text(o.d -> 'provinces')),
         nullif(o.d ->> 'night', ''),
         case when nullif(o.d ->> 'night', '') is null then null
              else coalesce((o.d ->> 'rooms')::integer, ceil(cardinality(v_people)::numeric / v_set.trip_people_per_room)::integer) end,
         greatest(coalesce((o.d ->> 'km')::integer, 0), 0)
    from jsonb_array_elements(p_days) with ordinality o(d, i);

  insert into public.sales_trip_people (trip_id, user_id) select v_row.id, u from unnest(v_people) u;

  insert into public.sales_trip_specials (trip_id, sort_order, reason, note, amount)
  select v_row.id, (o.i)::smallint, coalesce(nullif(btrim(o.l ->> 'reason'), ''), 'Other'), nullif(btrim(o.l ->> 'note'), ''), (o.l ->> 'amount')::numeric
    from jsonb_array_elements(coalesce(p_special, '[]')) with ordinality o(l, i);

  return v_row;
end;
$function$;

comment on function app.request_sales_trip is
  'Sends (or re-sends, with p_trip_id) a sales trip for approval: notice rule, day/overnight rules, active participants, no overlapping trip, special reasons; costs it at the current standard rates plus the fuel the requester typed.';

create function public.request_sales_trip(p_trip_id uuid, p_start date, p_days jsonb, p_people uuid[], p_special jsonb, p_note text default null, p_fuel numeric default 0)
returns public.sales_trips language sql set search_path to ''
as $function$ select * from app.request_sales_trip(p_trip_id, p_start, p_days, p_people, p_special, p_note, p_fuel); $function$;

revoke execute on function app.request_sales_trip(uuid, date, jsonb, uuid[], jsonb, text, numeric) from public;
revoke execute on function public.request_sales_trip(uuid, date, jsonb, uuid[], jsonb, text, numeric) from public;
grant execute on function app.request_sales_trip(uuid, date, jsonb, uuid[], jsonb, text, numeric) to authenticated;
grant execute on function public.request_sales_trip(uuid, date, jsonb, uuid[], jsonb, text, numeric) to authenticated;

-- ---------------------------------------------------------------- reads

-- sales_trips() JSON carries fuel_amount.
do $do$
declare
  v_def text := pg_get_functiondef('app.sales_trips(text)'::regprocedure);
  v_old text := $old$'km_rate', t.km_rate,$old$;
  v_new text := $new$'km_rate', t.km_rate, 'fuel_amount', t.fuel_amount,$new$;
begin
  if position(v_old in v_def) = 0 then
    raise exception 'sales_trips has changed; fuel_amount not added';
  end if;
  execute replace(v_def, v_old, v_new);
end
$do$;
