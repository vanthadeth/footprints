-- Footprints: per-person clock-in / clock-out window.
--
-- The company-wide rules on app_settings -- allow_early_clockin_minutes (how
-- long before the start of the day clock-in opens) and
-- auto_clockout_grace_minutes (how long after the end of the day someone
-- still clocked in is clocked out automatically and flagged) -- now have an
-- optional per-person override in user_clock_windows, set by anyone with
-- user:edit for that person (the Users screen). A null column = the company
-- setting, so overriding one leaves the other following the company.
--
-- app.clock_window(user) is THE one place that answers "what are this
-- person's early clock-in and auto clock-out minutes?". Changed to read it:
--   * app.within_clock_in_window() -- the clock-in check (from 0091).
--   * app.enforce_working_hours()  -- auto clock-out (from 0091).
--   * app.attendance_alerts()      -- the "still clocked in" alert and its
--     message, patched in place like 0100 did.
--
-- public.my_clock_window() gives the signed-in person their own window so the
-- app's "Clock in opens at" and background auto clock-out match the server;
-- public.user_clock_window(user) / public.set_user_clock_window(...) back
-- the Users screen.

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
create table public.user_clock_windows (
  user_id                     uuid primary key references public.users(id) on delete cascade,
  allow_early_clockin_minutes integer check (allow_early_clockin_minutes between 0 and 180),
  auto_clockout_grace_minutes integer check (auto_clockout_grace_minutes between 0 and 480),
  updated_at                  timestamptz not null default now(),
  updated_by                  uuid references public.users(id) default auth.uid()
);

comment on table public.user_clock_windows is
  'Per-person override of app_settings.allow_early_clockin_minutes / auto_clockout_grace_minutes. A null column (or no row) = the company setting. Written only via app.set_user_clock_window.';

create index user_clock_windows_updated_by_idx on public.user_clock_windows (updated_by);

alter table public.user_clock_windows enable row level security;

create policy user_clock_windows_select on public.user_clock_windows for select to authenticated
  using (user_id = (select auth.uid()) or app.can('user', 'view', user_id));

grant select on public.user_clock_windows to authenticated;

-- ---------------------------------------------------------------------------
-- app.clock_window: a person's effective window
-- ---------------------------------------------------------------------------
-- Security definer: callers (clock-in, alerts, auto clock-out) read it on
-- behalf of the person; it returns only the two numbers and whether each is
-- the person's own.
create function app.clock_window(p_user uuid)
returns table (
  allow_early_clockin_minutes integer,
  auto_clockout_grace_minutes integer,
  early_overridden            boolean,
  grace_overridden            boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(o.allow_early_clockin_minutes, a.allow_early_clockin_minutes, 0),
         coalesce(o.auto_clockout_grace_minutes, a.auto_clockout_grace_minutes, 0),
         o.allow_early_clockin_minutes is not null,
         o.auto_clockout_grace_minutes is not null
    from (select 1) one
    left join public.app_settings a on true
    left join public.user_clock_windows o on o.user_id = p_user
   limit 1;
$$;

comment on function app.clock_window is
  'p_user''s early clock-in and auto clock-out minutes: their user_clock_windows override, else the app_settings company setting.';

-- ---------------------------------------------------------------------------
-- Clock-in window (0091, early minutes from app.clock_window)
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

  return v_local >= (v_start - make_interval(mins => v_early)) and v_local < v_end;
end;
$function$;

-- ---------------------------------------------------------------------------
-- Auto clock-out (0091, grace minutes from app.clock_window)
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
  select c.auto_clockout_grace_minutes into v_grace from app.clock_window(v_me) c;
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
-- attendance_alerts: "still clocked in" against the person's own grace
-- ---------------------------------------------------------------------------
do $$
declare
  v_def text := pg_get_functiondef('app.attendance_alerts()'::regprocedure);
  v_new text := v_def;
  v_pairs text[][] := array[
    array[E'      cross join lateral app.work_day(a.user_id, n.ts::date) w\n',
          E'      cross join lateral app.work_day(a.user_id, n.ts::date) w\n      cross join lateral app.clock_window(a.user_id) cw\n'],
    array[$r$' is still clocked in, ' || s.auto_clockout_grace_minutes$r$,
          $r$' is still clocked in, ' || cw.auto_clockout_grace_minutes$r$],
    array[$r$w.end_time + make_interval(mins => s.auto_clockout_grace_minutes)$r$,
          $r$w.end_time + make_interval(mins => cw.auto_clockout_grace_minutes)$r$]
  ];
  i int;
begin
  for i in 1 .. array_length(v_pairs, 1) loop
    if position(v_pairs[i][1] in v_new) = 0 then
      raise exception 'attendance_alerts: patch % not found', i;
    end if;
    v_new := replace(v_new, v_pairs[i][1], v_pairs[i][2]);
  end loop;
  execute v_new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reading and setting a person's window
-- ---------------------------------------------------------------------------
-- The person's override (null = company) next to the company setting, for
-- the Users screen.
create function app.user_clock_window(p_user uuid)
returns table (
  allow_early_clockin_minutes integer,
  auto_clockout_grace_minutes integer,
  company_early_clockin_minutes integer,
  company_clockout_grace_minutes integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (p_user = auth.uid() or app.can('user', 'view', p_user)) then
    raise exception 'insufficient_privilege';
  end if;
  return query
    select o.allow_early_clockin_minutes, o.auto_clockout_grace_minutes,
           coalesce(a.allow_early_clockin_minutes, 0), coalesce(a.auto_clockout_grace_minutes, 0)
      from (select 1) one
      left join public.app_settings a on true
      left join public.user_clock_windows o on o.user_id = p_user
     limit 1;
end;
$$;

-- Null = follow the company setting; both null removes the override.
create function app.set_user_clock_window(p_user uuid, p_early integer, p_grace integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app.can('user', 'edit', p_user) then
    raise exception 'insufficient_privilege';
  end if;
  if p_early is not null and (p_early < 0 or p_early > 180) then
    raise exception 'invalid_clock_window' using detail = 'Early clock-in is 0 to 180 minutes.';
  end if;
  if p_grace is not null and (p_grace < 0 or p_grace > 480) then
    raise exception 'invalid_clock_window' using detail = 'Auto clock-out delay is 0 to 480 minutes.';
  end if;

  if p_early is null and p_grace is null then
    delete from public.user_clock_windows where user_id = p_user;
    return;
  end if;

  insert into public.user_clock_windows (user_id, allow_early_clockin_minutes, auto_clockout_grace_minutes, updated_by)
  values (p_user, p_early, p_grace, auth.uid())
  on conflict (user_id) do update
    set allow_early_clockin_minutes = excluded.allow_early_clockin_minutes,
        auto_clockout_grace_minutes = excluded.auto_clockout_grace_minutes,
        updated_at = now(),
        updated_by = auth.uid();
end;
$$;

-- ---------------------------------------------------------------------------
-- Public API
-- ---------------------------------------------------------------------------
create function public.my_clock_window()
returns table (allow_early_clockin_minutes integer, auto_clockout_grace_minutes integer)
language sql
stable
set search_path = ''
as $$ select c.allow_early_clockin_minutes, c.auto_clockout_grace_minutes from app.clock_window(auth.uid()) c; $$;

create function public.user_clock_window(p_user uuid)
returns table (
  allow_early_clockin_minutes integer,
  auto_clockout_grace_minutes integer,
  company_early_clockin_minutes integer,
  company_clockout_grace_minutes integer
)
language sql
stable
set search_path = ''
as $$ select * from app.user_clock_window(p_user); $$;

create function public.set_user_clock_window(p_user uuid, p_early integer, p_grace integer)
returns void
language sql
set search_path = ''
as $$ select app.set_user_clock_window(p_user, p_early, p_grace); $$;

revoke execute on function app.clock_window(uuid) from public;
revoke execute on function app.user_clock_window(uuid) from public;
revoke execute on function app.set_user_clock_window(uuid, integer, integer) from public;
revoke execute on function public.my_clock_window() from public;
revoke execute on function public.user_clock_window(uuid) from public;
revoke execute on function public.set_user_clock_window(uuid, integer, integer) from public;
grant execute on function app.clock_window(uuid) to authenticated, service_role;
grant execute on function app.user_clock_window(uuid) to authenticated;
grant execute on function app.set_user_clock_window(uuid, integer, integer) to authenticated;
grant execute on function public.my_clock_window() to authenticated;
grant execute on function public.user_clock_window(uuid) to authenticated;
grant execute on function public.set_user_clock_window(uuid, integer, integer) to authenticated;
