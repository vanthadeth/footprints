-- Footprints: sales trips for the province sales team.
--
-- A trip is a start date and days. Each day visits provinces in order and
-- ends with an overnight province, or back in Phnom Penh on the last day.
-- One or more people go (the requester always does), hotel rooms are
-- counted per night (shared rooms allowed), and special allowance lines
-- cover what the standard rates don't (ferry, parking, a customer event).
--
-- Every request is costed at the standard rates on app_settings, which
-- are copied onto the trip when it is sent so a later rate change never
-- rewrites an old trip:
--   daily allowance = days x people x day rate
--   hotel           = room-nights x night rate
--   fuel/transport  = route km x km rate (once: the team shares a vehicle)
--   + special allowance lines
--
-- Rules (request_sales_trip): sent at least trip_notice_hours before the
-- trip leaves (trip_leave_time on day 1, Phnom Penh time); every day visits
-- at least one province; every day but the last has an overnight; the last
-- returns to Phnom Penh; no overlap with another pending/approved trip of
-- the requester; special lines need a reason when the setting says so.
--
-- Approval: the sales_trip 'edit' permission (Sale Manager: any; Super
-- Admin always). One decision covers everyone on the trip. Approving lets
-- every participant clock in away from their work locations on trip days
-- (app_settings.trip_clock_anywhere), and puts the trip on their calendar.
--
-- Route km come from the app (straight line x 1.2 between provincial
-- capitals) -- an estimate, stored per day.

-- ---------------------------------------------------------------- settings

alter table public.app_settings
  add column trip_day_rate numeric(10,2) not null default 10 check (trip_day_rate >= 0),
  add column trip_night_rate numeric(10,2) not null default 15 check (trip_night_rate >= 0),
  add column trip_km_rate numeric(10,3) not null default 0.10 check (trip_km_rate >= 0),
  add column trip_people_per_room smallint not null default 2 check (trip_people_per_room between 1 and 6),
  add column trip_special_cap numeric(10,2) not null default 100 check (trip_special_cap >= 0),
  add column trip_special_reason_required boolean not null default true,
  add column trip_notice_hours smallint not null default 24 check (trip_notice_hours between 0 and 720),
  add column trip_leave_time time not null default '08:00',
  add column trip_clock_anywhere boolean not null default true;

comment on column public.app_settings.trip_day_rate is 'Sales trip daily allowance, per person per trip day (USD).';
comment on column public.app_settings.trip_night_rate is 'Sales trip hotel rate, per room per night (USD).';
comment on column public.app_settings.trip_km_rate is 'Sales trip fuel/transport rate per km of the planned route, counted once per trip (USD).';
comment on column public.app_settings.trip_people_per_room is 'Default people sharing a hotel room; sets the default rooms a night.';
comment on column public.app_settings.trip_special_cap is 'Special allowance per trip above which the request is flagged to the approver (not blocked).';
comment on column public.app_settings.trip_notice_hours is 'A trip must be sent at least this many hours before it leaves.';
comment on column public.app_settings.trip_leave_time is 'When a trip leaves on its first day (Phnom Penh time), for the notice rule.';
comment on column public.app_settings.trip_clock_anywhere is 'On approved trip days, participants can clock in/out away from their work locations.';

-- ---------------------------------------------------------------- tables

create type public.sales_trip_status as enum ('pending', 'approved', 'changes', 'rejected', 'cancelled');

comment on type public.sales_trip_status is
  'pending -> approved | rejected | changes (the approver asks for changes; the requester edits and re-sends, back to pending); pending/changes/approved -> cancelled by the requester before it starts.';

create table public.sales_trips (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.users(id) on delete cascade,
  start_date     date not null,
  end_date       date not null,
  note           text,
  status         public.sales_trip_status not null default 'pending',
  total_km       integer not null default 0 check (total_km >= 0),
  day_rate       numeric(10,2) not null,
  night_rate     numeric(10,2) not null,
  km_rate        numeric(10,3) not null,
  people_count   smallint not null check (people_count >= 1),
  room_nights    smallint not null check (room_nights >= 0),
  special_total  numeric(10,2) not null default 0,
  est_total      numeric(12,2) not null,
  decided_by     uuid references public.users(id),
  decided_at     timestamptz,
  decision_note  text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint sales_trips_range check (end_date >= start_date)
);

comment on table public.sales_trips is
  'A province sales trip request. Rates are a copy of app_settings at send time; est_total = days x people x day_rate + room_nights x night_rate + total_km x km_rate + special_total. Written only via request/decide/cancel_sales_trip.';

create table public.sales_trip_days (
  trip_id         uuid not null references public.sales_trips(id) on delete cascade,
  day_no          smallint not null check (day_no >= 1),
  day             date not null,
  provinces       text[] not null check (cardinality(provinces) >= 1),
  night_province  text references public.geo_provinces(code),
  rooms           smallint check (rooms >= 1),
  km              integer not null default 0 check (km >= 0),
  primary key (trip_id, day_no)
);

comment on table public.sales_trip_days is
  'One day of a trip: provinces visited in order (geo_provinces codes), the overnight province (null = back in Phnom Penh, the last day) and hotel rooms that night.';

create table public.sales_trip_people (
  trip_id  uuid not null references public.sales_trips(id) on delete cascade,
  user_id  uuid not null references public.users(id) on delete cascade,
  primary key (trip_id, user_id)
);

comment on table public.sales_trip_people is 'Everyone on a trip, the requester included.';

create table public.sales_trip_specials (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid not null references public.sales_trips(id) on delete cascade,
  sort_order  smallint not null default 0,
  reason      text not null,
  note        text,
  amount      numeric(10,2) not null check (amount >= 0)
);

comment on table public.sales_trip_specials is 'Special allowance lines on a trip: a reason (Ferry / boat, Parking & tolls, Customer event, Loading help, Other), a note and an amount.';

create index sales_trips_user_idx on public.sales_trips (user_id, start_date);
create index sales_trips_pending_idx on public.sales_trips (status) where status = 'pending';
create index sales_trip_people_user_idx on public.sales_trip_people (user_id);
create index sales_trip_days_day_idx on public.sales_trip_days (day);

-- ---------------------------------------------------------------- module + grants

insert into public.modules (key, name, icon, href, sort_order, active, group_name) values
  ('sales_trip', 'Sales trips', 'map', 'trips', 22, true, 'People');

-- The province sales team requests trips; Sale Manager approves anyone's.
insert into public.role_permissions (role_id, module_key, action, scope)
select r.id, 'sales_trip', a.action::public.permission_action, 'own'::public.permission_scope
  from public.roles r
 cross join (values ('view'), ('add'), ('edit')) a(action)
 where r.key in ('salesperson_province', 'remote_sales');

insert into public.role_permissions (role_id, module_key, action, scope)
select r.id, 'sales_trip', a.action::public.permission_action, a.scope::public.permission_scope
  from public.roles r
 cross join (values ('view', 'any'), ('add', 'own'), ('edit', 'any')) a(action, scope)
 where r.key = 'sales_manager';

-- ---------------------------------------------------------------- visibility

-- Requester, participants, and whoever can view the requester's trips.
create function app.trip_visible(p_trip uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists (
    select 1 from public.sales_trips t
     where t.id = p_trip
       and (t.user_id = auth.uid()
            or exists (select 1 from public.sales_trip_people p where p.trip_id = t.id and p.user_id = auth.uid())
            or app.can('sales_trip', 'view', t.user_id))
  );
$function$;

alter table public.sales_trips enable row level security;
alter table public.sales_trip_days enable row level security;
alter table public.sales_trip_people enable row level security;
alter table public.sales_trip_specials enable row level security;

-- Reads only; every write goes through the RPCs below.
create policy sales_trips_select on public.sales_trips for select using (app.trip_visible(id));
create policy sales_trip_days_select on public.sales_trip_days for select using (app.trip_visible(trip_id));
create policy sales_trip_people_select on public.sales_trip_people for select using (app.trip_visible(trip_id));
create policy sales_trip_specials_select on public.sales_trip_specials for select using (app.trip_visible(trip_id));

-- ---------------------------------------------------------------- request

-- p_days: [{ "provinces": ["TKO","KMP"], "night": "KMP", "rooms": 2, "km": 175 }, ...] (night null on the last day).
-- p_special: [{ "reason": "Ferry / boat", "note": "...", "amount": 24 }, ...].
-- p_trip_id: re-send a trip of yours that is pending or had changes asked.
create function app.request_sales_trip(
  p_trip_id  uuid,
  p_start    date,
  p_days     jsonb,
  p_people   uuid[],
  p_special  jsonb,
  p_note     text default null
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

  if p_trip_id is null then
    insert into public.sales_trips (user_id, start_date, end_date, note, total_km, day_rate, night_rate, km_rate, people_count, room_nights, special_total, est_total)
    values (v_me, p_start, v_end, nullif(btrim(p_note), ''), v_total_km, v_set.trip_day_rate, v_set.trip_night_rate, v_set.trip_km_rate,
            cardinality(v_people), v_rn, v_special,
            v_n * cardinality(v_people) * v_set.trip_day_rate + v_rn * v_set.trip_night_rate + round(v_total_km * v_set.trip_km_rate, 2) + v_special)
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
           day_rate = v_set.trip_day_rate, night_rate = v_set.trip_night_rate, km_rate = v_set.trip_km_rate,
           people_count = cardinality(v_people), room_nights = v_rn, special_total = v_special,
           est_total = v_n * cardinality(v_people) * v_set.trip_day_rate + v_rn * v_set.trip_night_rate + round(v_total_km * v_set.trip_km_rate, 2) + v_special,
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
  'Sends (or re-sends, with p_trip_id) a sales trip for approval: notice rule, day/overnight rules, active participants, no overlapping trip, special reasons; costs it at the current standard rates.';

-- ---------------------------------------------------------------- decide / cancel

create function app.decide_sales_trip(p_id uuid, p_decision text, p_note text default null)
returns public.sales_trips
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_me  uuid := auth.uid();
  v_row public.sales_trips;
begin
  if p_decision not in ('approved', 'rejected', 'changes') then
    raise exception 'invalid_input' using detail = 'Approve, reject or ask for changes.';
  end if;
  select * into v_row from public.sales_trips where id = p_id for update;
  if not found then
    raise exception 'not_found';
  end if;
  if v_row.status <> 'pending' then
    raise exception 'invalid_state' using detail = 'This trip has already been decided.';
  end if;
  if v_row.user_id = v_me then
    raise exception 'insufficient_privilege' using errcode = 'insufficient_privilege', detail = 'You can’t decide your own trip.';
  end if;
  if not app.can('sales_trip', 'edit', v_row.user_id) then
    raise exception 'insufficient_privilege' using errcode = 'insufficient_privilege', detail = 'Only a Sales Manager or Super Admin can decide trips.';
  end if;
  if p_decision = 'changes' and coalesce(btrim(p_note), '') = '' then
    raise exception 'invalid_input' using detail = 'Say what should change.';
  end if;

  update public.sales_trips
     set status = p_decision::public.sales_trip_status, decided_by = v_me, decided_at = now(),
         decision_note = nullif(btrim(p_note), ''), updated_at = now()
   where id = p_id
   returning * into v_row;
  return v_row;
end;
$function$;

create function app.cancel_sales_trip(p_id uuid)
returns public.sales_trips
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_me  uuid := auth.uid();
  v_row public.sales_trips;
begin
  select * into v_row from public.sales_trips where id = p_id for update;
  if not found or v_row.user_id <> v_me then
    raise exception 'not_found' using detail = 'Only the person who sent a trip can cancel it.';
  end if;
  if v_row.status not in ('pending', 'changes', 'approved') then
    raise exception 'invalid_state' using detail = 'This trip can’t be cancelled.';
  end if;
  if v_row.start_date <= (now() at time zone 'Asia/Phnom_Penh')::date then
    raise exception 'invalid_state' using detail = 'This trip has already started.';
  end if;
  update public.sales_trips set status = 'cancelled', updated_at = now() where id = p_id returning * into v_row;
  return v_row;
end;
$function$;

-- ---------------------------------------------------------------- reads

-- Trips as one JSON list. p_mode 'mine': trips I sent or am on. 'team':
-- trips of people whose trips I can view (approvers), mine excluded.
create function app.sales_trips(p_mode text default 'mine')
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
  select coalesce(jsonb_agg(x.j order by x.start_date desc, x.created_at desc), '[]'::jsonb)
  from (
    select t.start_date, t.created_at, jsonb_build_object(
      'id', t.id, 'user_id', t.user_id,
      'requester', coalesce(nullif(btrim(ru.nickname), ''), ru.full_name), 'requester_role', rr.name,
      'status', t.status, 'start_date', t.start_date, 'end_date', t.end_date, 'note', t.note,
      'total_km', t.total_km, 'day_rate', t.day_rate, 'night_rate', t.night_rate, 'km_rate', t.km_rate,
      'people_count', t.people_count, 'room_nights', t.room_nights, 'special_total', t.special_total, 'est_total', t.est_total,
      'decided_by', coalesce(nullif(btrim(du.nickname), ''), du.full_name), 'decided_at', t.decided_at, 'decision_note', t.decision_note,
      'created_at', t.created_at,
      'can_decide', t.status = 'pending' and t.user_id <> auth.uid() and app.can('sales_trip', 'edit', t.user_id),
      'days', (select coalesce(jsonb_agg(jsonb_build_object('day_no', d.day_no, 'day', d.day, 'provinces', to_jsonb(d.provinces), 'night', d.night_province, 'rooms', d.rooms, 'km', d.km) order by d.day_no), '[]')
                 from public.sales_trip_days d where d.trip_id = t.id),
      'people', (select coalesce(jsonb_agg(jsonb_build_object('user_id', u.id, 'name', coalesce(nullif(btrim(u.nickname), ''), u.full_name), 'full_name', u.full_name, 'role', r.name)
                                           order by (u.id = t.user_id) desc, u.full_name), '[]')
                   from public.sales_trip_people p join public.users u on u.id = p.user_id left join public.roles r on r.id = u.role_id
                  where p.trip_id = t.id),
      'specials', (select coalesce(jsonb_agg(jsonb_build_object('reason', s.reason, 'note', s.note, 'amount', s.amount) order by s.sort_order), '[]')
                     from public.sales_trip_specials s where s.trip_id = t.id)
    ) as j
    from public.sales_trips t
    join public.users ru on ru.id = t.user_id
    left join public.roles rr on rr.id = ru.role_id
    left join public.users du on du.id = t.decided_by
    where case when p_mode = 'team'
               then t.user_id <> auth.uid() and app.can('sales_trip', 'view', t.user_id)
                    and not exists (select 1 from public.sales_trip_people p where p.trip_id = t.id and p.user_id = auth.uid())
               else t.user_id = auth.uid() or exists (select 1 from public.sales_trip_people p where p.trip_id = t.id and p.user_id = auth.uid())
          end
  ) x;
$function$;

comment on function app.sales_trips is
  'Trips with days, people and special lines as JSON. mine = sent by me or I''m on it; team = trips I can view as an approver.';

-- People who can join a trip, with what keeps them busy between p_from and p_to (leave, another trip).
create function app.sales_trip_candidates(p_from date, p_to date, p_trip uuid default null)
returns table (user_id uuid, name text, full_name text, role text, field_sales boolean, busy jsonb)
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
  if not app.can('sales_trip', 'add', auth.uid()) then
    raise exception 'insufficient_privilege' using errcode = 'insufficient_privilege';
  end if;
  if p_to < p_from or p_to - p_from > 62 then
    raise exception 'invalid_input' using detail = 'Pick a range of up to 62 days.';
  end if;
  return query
  select u.id, coalesce(nullif(btrim(u.nickname), ''), u.full_name), u.full_name, r.name, coalesce(u.is_field_sales, false),
         coalesce((
           select jsonb_agg(jsonb_build_object('day', b.day, 'why', b.why) order by b.day)
             from (
               select g::date as day, case when lr.leave_type = 'flex' then 'Day off' else 'Leave' end as why
                 from public.leave_requests lr
                 cross join lateral generate_series(greatest(lr.start_date, p_from), least(lr.end_date, p_to), interval '1 day') g
                where lr.user_id = u.id and lr.status in ('pending', 'approved') and lr.start_date <= p_to and lr.end_date >= p_from
               union
               select d.day, 'On another trip'
                 from public.sales_trip_days d
                 join public.sales_trips t on t.id = d.trip_id
                 join public.sales_trip_people p on p.trip_id = t.id and p.user_id = u.id
                where t.status in ('pending', 'approved') and t.id is distinct from p_trip and d.day between p_from and p_to
             ) b), '[]'::jsonb)
    from public.users u
    left join public.roles r on r.id = u.role_id
   where u.status = 'active'
   order by coalesce(u.is_field_sales, false) desc, u.full_name;
end;
$function$;

comment on function app.sales_trip_candidates is
  'Active people who could join a trip, field sales first, with the days between p_from and p_to they are on leave or another trip.';

-- On an approved trip that day (requester or participant), with the clock-anywhere setting on.
create function app.trip_clock_free(p_user uuid, p_day date)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select coalesce((select s.trip_clock_anywhere from public.app_settings s limit 1), false)
     and exists (
       select 1 from public.sales_trip_days d
         join public.sales_trips t on t.id = d.trip_id and t.status = 'approved'
         join public.sales_trip_people p on p.trip_id = t.id and p.user_id = p_user
        where d.day = p_day
     );
$function$;

comment on function app.trip_clock_free is
  'True when the person is on an approved sales trip that day and trip_clock_anywhere is on: work-location clock rules don''t apply.';

-- Work-location rules don't apply on an approved trip day.
create or replace function app.clock_location_requirement(p_user uuid, p_direction text)
returns uuid[]
language sql
stable
security definer
set search_path to ''
as $function$
  select case when app.trip_clock_free(p_user, (now() at time zone 'Asia/Phnom_Penh')::date) then '{}'::uuid[]
    else coalesce(
      (select r.location_ids from public.clock_location_rules r where r.user_id = p_user and r.direction = p_direction),
      (select r.location_ids from public.clock_location_rules r
         join public.users u on u.role_id = r.role_id
        where u.id = p_user and r.direction = p_direction),
      '{}'::uuid[]
    ) end;
$function$;

comment on function app.clock_location_requirement is
  'Active-or-not location ids a person must be inside to clock in/out: their own rule, else their role''s, else {} (anywhere). {} on an approved sales trip day (trip_clock_anywhere).';

-- ---------------------------------------------------------------- calendar

-- Trip days on the calendar: kind 'trip', ref_id = trip, source_label =
-- 'KEP,KMP|KMP' (provinces | overnight, empty = back to Phnom Penh), title
-- carries "(waiting for approval)" while pending.
do $do$
declare
  v_def text := pg_get_functiondef('app.calendar_items(uuid,date,date)'::regprocedure);
  v_old text := $old$
  union all
  select 'holiday'::text, h.id, g::date, null::time,$old$;
  v_new text := $new$
  union all
  select 'trip'::text, t.id, d.day, null::time,
         'Sales trip · day ' || d.day_no || ' of ' || (t.end_date - t.start_date + 1)
           || case when t.status = 'pending' then ' (waiting for approval)' else '' end,
         null::uuid, null::text, false, null::numeric, null::date,
         array_to_string(d.provinces, ',') || '|' || coalesce(d.night_province, ''),
         null::text, false, d.day_no
    from public.sales_trip_days d
    join public.sales_trips t on t.id = d.trip_id and t.status in ('pending', 'approved')
    join public.sales_trip_people p on p.trip_id = t.id and p.user_id = p_user
   where d.day between p_from and p_to

  union all
  select 'holiday'::text, h.id, g::date, null::time,$new$;
begin
  if position(v_old in v_def) = 0 then
    raise exception 'calendar_items has changed; trip union not added';
  end if;
  execute replace(v_def, v_old, v_new);
end
$do$;

-- ---------------------------------------------------------------- wrappers

create function public.request_sales_trip(p_trip_id uuid, p_start date, p_days jsonb, p_people uuid[], p_special jsonb, p_note text default null)
returns public.sales_trips language sql set search_path to ''
as $function$ select * from app.request_sales_trip(p_trip_id, p_start, p_days, p_people, p_special, p_note); $function$;

create function public.decide_sales_trip(p_id uuid, p_decision text, p_note text default null)
returns public.sales_trips language sql set search_path to ''
as $function$ select * from app.decide_sales_trip(p_id, p_decision, p_note); $function$;

create function public.cancel_sales_trip(p_id uuid)
returns public.sales_trips language sql set search_path to ''
as $function$ select * from app.cancel_sales_trip(p_id); $function$;

create function public.sales_trips(p_mode text default 'mine')
returns jsonb language sql stable set search_path to ''
as $function$ select app.sales_trips(p_mode); $function$;

create function public.sales_trip_candidates(p_from date, p_to date, p_trip uuid default null)
returns table (user_id uuid, name text, full_name text, role text, field_sales boolean, busy jsonb)
language sql stable set search_path to ''
as $function$ select * from app.sales_trip_candidates(p_from, p_to, p_trip); $function$;

revoke execute on function app.trip_visible(uuid) from public;
revoke execute on function app.request_sales_trip(uuid, date, jsonb, uuid[], jsonb, text) from public;
revoke execute on function app.decide_sales_trip(uuid, text, text) from public;
revoke execute on function app.cancel_sales_trip(uuid) from public;
revoke execute on function app.sales_trips(text) from public;
revoke execute on function app.sales_trip_candidates(date, date, uuid) from public;
revoke execute on function app.trip_clock_free(uuid, date) from public;
revoke execute on function public.request_sales_trip(uuid, date, jsonb, uuid[], jsonb, text) from public;
revoke execute on function public.decide_sales_trip(uuid, text, text) from public;
revoke execute on function public.cancel_sales_trip(uuid) from public;
revoke execute on function public.sales_trips(text) from public;
revoke execute on function public.sales_trip_candidates(date, date, uuid) from public;

grant execute on function app.trip_visible(uuid) to authenticated;
grant execute on function app.request_sales_trip(uuid, date, jsonb, uuid[], jsonb, text) to authenticated;
grant execute on function app.decide_sales_trip(uuid, text, text) to authenticated;
grant execute on function app.cancel_sales_trip(uuid) to authenticated;
grant execute on function app.sales_trips(text) to authenticated;
grant execute on function app.sales_trip_candidates(date, date, uuid) to authenticated;
grant execute on function app.trip_clock_free(uuid, date) to authenticated;
grant execute on function public.request_sales_trip(uuid, date, jsonb, uuid[], jsonb, text) to authenticated;
grant execute on function public.decide_sales_trip(uuid, text, text) to authenticated;
grant execute on function public.cancel_sales_trip(uuid) to authenticated;
grant execute on function public.sales_trips(text) to authenticated;
grant execute on function public.sales_trip_candidates(date, date, uuid) to authenticated;
grant select on public.sales_trips, public.sales_trip_days, public.sales_trip_people, public.sales_trip_specials to authenticated;
