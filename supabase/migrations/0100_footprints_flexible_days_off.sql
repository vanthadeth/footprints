-- Footprints: flexible days off for people who travel.
--
-- Two kinds of employee:
--   * Company schedule (the default): the company's working days and hours;
--     weekends and public holidays are days off.
--   * Flexible (travel): works through weekends while travelling. Public
--     holidays are still off, but every other day is a working day and,
--     instead of a fixed weekend, each attendance cycle earns an allowance
--     of flex_saturday_rate per Saturday + flex_sunday_rate per Sunday
--     (½ and 1 by default). It's usable from the first day of the cycle
--     (days can be taken in advance): a requested flexible day off
--     (leave_type 'flex', 0099) or a day with no clock-in uses it.
--     At the cycle close it settles: unused days aren't carried over, and
--     days taken beyond the allowance come from annual leave (unpaid only
--     if annual leave runs out).
--
-- A person's rule lives in day_off_modes as a history of changes, each
-- effective from the start of a cycle: the next one by default, or the
-- current one when an admin chooses "Start this cycle" (the cycle is then
-- counted under the new rule).
--
-- Replaced in place (same signatures): app.work_day (flexible people work
-- every non-holiday day), app.leave_used_days (annual includes settled
-- overdraws), app.request_leave ('flex' only for flexible people, no
-- quota), app.attendance_days (a flexible person's day with no clock-in is
-- 'dayoff', not 'absent'), app.attendance_alerts (no "not clocked in yet"
-- alert for flexible people), and the leave title in app.calendar_items.

-- ---------------------------------------------------------------------------
-- Settings and tables
-- ---------------------------------------------------------------------------
alter table public.app_settings
  add column flex_saturday_rate numeric(3,1) not null default 0.5 check (flex_saturday_rate between 0 and 2 and flex_saturday_rate * 2 = trunc(flex_saturday_rate * 2)),
  add column flex_sunday_rate numeric(3,1) not null default 1 check (flex_sunday_rate between 0 and 2 and flex_sunday_rate * 2 = trunc(flex_sunday_rate * 2));

comment on column public.app_settings.flex_saturday_rate is 'Days off a Saturday earns people on Flexible (travel) days off, per attendance cycle.';
comment on column public.app_settings.flex_sunday_rate is 'Days off a Sunday earns people on Flexible (travel) days off, per attendance cycle.';

create table public.day_off_modes (
  user_id        uuid not null references public.users(id) on delete cascade,
  effective_from date not null,
  mode           text not null check (mode in ('company', 'flexible')),
  set_by         uuid references public.users(id) default auth.uid(),
  set_at         timestamptz not null default now(),
  primary key (user_id, effective_from)
);

comment on table public.day_off_modes is
  'A person''s days-off rule over time: company schedule or flexible (travel), each row effective from the start of an attendance cycle. No row on or before a date = company. Written only via app.set_day_off_mode.';

create index day_off_modes_set_by_idx on public.day_off_modes (set_by);

create table public.flex_settlements (
  user_id      uuid not null references public.users(id) on delete cascade,
  cycle_start  date not null,
  cycle_end    date not null,
  saturdays    integer not null,
  sundays      integer not null,
  allowance    numeric(5,1) not null,
  requested    numeric(5,1) not null,
  auto_days    numeric(5,1) not null,
  unused_days  numeric(5,1) not null,
  over_days    numeric(5,1) not null,
  annual_days  numeric(5,1) not null,
  unpaid_days  numeric(5,1) not null,
  settled_at   timestamptz not null default now(),
  primary key (user_id, cycle_end)
);

comment on table public.flex_settlements is
  'One closed attendance cycle of a person on flexible days off, frozen when it settled (app.settle_flex_cycles): allowance, days used (requested + no clock-in), unused (not carried over), and days over the allowance taken from annual leave (annual_days, counted by app.leave_used_days) or unpaid when annual leave ran out.';

alter table public.day_off_modes enable row level security;
alter table public.flex_settlements enable row level security;

create policy day_off_modes_select on public.day_off_modes for select to authenticated
  using (user_id = (select auth.uid()) or app.can('user', 'view', user_id) or app.can('leave', 'view', user_id));
create policy flex_settlements_select on public.flex_settlements for select to authenticated
  using (user_id = (select auth.uid()) or app.can('leave', 'view', user_id) or app.can('leave_balance', 'view', user_id));

grant select on public.day_off_modes, public.flex_settlements to authenticated;

-- ---------------------------------------------------------------------------
-- Cycles and modes
-- ---------------------------------------------------------------------------
-- The attendance cycle containing p_date. Closing on the 20th covers the
-- 21st of the previous month to the 20th; 0 = the calendar month. Same
-- maths as src/features/attendanceSummary/attendanceCycle.ts (cycleFor).
create function app.cycle_bounds(p_date date)
returns table (cycle_start date, cycle_end date)
language sql
stable
security definer
set search_path = ''
as $$
  with s as (select coalesce((select attendance_cycle_close_day from public.app_settings limit 1), 20)::integer as c),
       m as (select date_trunc('month', p_date)::date as first)
  select
    case when s.c = 0 then m.first
         when extract(day from p_date)::integer <= s.c then (m.first - interval '1 month')::date + s.c
         else m.first + s.c end,
    case when s.c = 0 then (m.first + interval '1 month')::date - 1
         when extract(day from p_date)::integer <= s.c then m.first + s.c - 1
         else (m.first + interval '1 month')::date + s.c - 1 end
  from s, m;
$$;

create function app.day_off_mode(p_user uuid, p_date date)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select m.mode from public.day_off_modes m
      where m.user_id = p_user and m.effective_from <= p_date
      order by m.effective_from desc limit 1),
    'company');
$$;

comment on function app.day_off_mode is 'company or flexible: p_user''s days-off rule on p_date (day_off_modes).';

-- ---------------------------------------------------------------------------
-- app.work_day: flexible people work every day that isn't a holiday
-- ---------------------------------------------------------------------------
create or replace function app.work_day(p_user uuid, p_date date)
returns table (
  is_working     boolean,
  scheduled_day  boolean,
  holiday_id     uuid,
  holiday_name   text,
  holiday_half   boolean,
  start_time     time,
  end_time       time,
  break_minutes  integer,
  break_paid     boolean,
  team_schedule  boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with person as (
    select u.department_id from public.users u where u.id = p_user
  ),
  sched as (
    select s.id, s.break_paid, s.department_id
      from public.work_schedules s
     where s.department_id is null
        or s.department_id = (select department_id from person)
     order by (s.department_id is null)
     limit 1
  ),
  flex as (
    select app.day_off_mode(p_user, p_date) = 'flexible' as yes
  ),
  -- The schedule's longest working day: a flexible person's hours on any day.
  longest as (
    select d.* from public.work_schedule_days d
     where d.schedule_id = (select id from sched) and d.is_working
     order by (d.end_time - d.start_time) desc, d.iso_dow
     limit 1
  ),
  day as (
    select d.* from public.work_schedule_days d
     where not (select yes from flex)
       and d.schedule_id = (select id from sched)
       and d.iso_dow = extract(isodow from p_date)::smallint
    union all
    select l.* from longest l where (select yes from flex)
  ),
  hol as (
    select h.id, h.name, h.half_day
      from public.public_holidays h
     where p_date between h.start_date and h.end_date
       and (h.department_ids is null or (select department_id from person) = any (h.department_ids))
     order by h.half_day, h.start_date
     limit 1
  ),
  fallback as (
    select coalesce(a.work_start_time, time '08:00') as ws, coalesce(a.work_end_time, time '17:00') as we
      from (select 1) one left join public.app_settings a on true
     limit 1
  ),
  sd as (
    select (select yes from flex) or coalesce((select is_working from day), extract(isodow from p_date) < 6) as working
  )
  select
    (select working from sd) and not coalesce((select not half_day from hol), false) as is_working,
    (select working from sd) as scheduled_day,
    (select id from hol),
    (select name from hol),
    coalesce((select half_day from hol), false),
    coalesce((select start_time from day), (select ws from fallback)),
    case when (select half_day from hol) then least(coalesce((select end_time from day), (select we from fallback)), time '12:00')
         else coalesce((select end_time from day), (select we from fallback)) end,
    case when (select half_day from hol) then 0 else coalesce((select break_minutes from day), 0) end,
    coalesce((select break_paid from sched), false),
    coalesce((select department_id is not null from sched), false);
$$;

comment on function app.work_day is
  'The schedule for p_user on p_date: whether it is a working day (team schedule, else company schedule; every day for people on flexible days off, with the schedule''s longest day''s hours; minus public holidays -- a half-day holiday keeps the morning), start/end/break, and the holiday if any.';

-- ---------------------------------------------------------------------------
-- Per-day flexible days off, and a cycle's numbers
-- ---------------------------------------------------------------------------
-- Internal (no permission check): one row per date a person is on flexible
-- days off (and employed) in [p_from, p_to]. kind / cost against the
-- allowance:
--   holiday  a full holiday -- 0
--   worked   clocked in -- 0
--   flex     an approved flexible day off -- its day fraction
--   pend     a pending flexible day off -- its day fraction (planned)
--   leave    other approved leave (annual/sick/unpaid) -- 0
--   upcoming today or later -- 0
--   auto     a past day with no clock-in -- 1 (½ on a half-day holiday)
create function app.flex_days_raw(p_user uuid, p_from date, p_to date)
returns table (day date, kind text, cost numeric, weekday smallint, request_id uuid, holiday_name text)
language sql
stable
security definer
set search_path = ''
as $$
  with b as (select (now() at time zone 'Asia/Phnom_Penh')::date as today),
  u as (select employment_date from public.users where id = p_user),
  days as (
    select g::date as d from generate_series(p_from, least(p_to, p_from + 400), interval '1 day') g
  ),
  att as (
    select distinct (a.clock_in_at at time zone 'Asia/Phnom_Penh')::date as d
      from public.attendance a
     where a.user_id = p_user
       and (a.clock_in_at at time zone 'Asia/Phnom_Penh')::date between p_from and p_to
  ),
  req as (
    select distinct on (dd.d) dd.d, r.id, r.leave_type, r.status,
           app.leave_request_days(r.user_id, dd.d, dd.d, x.part, x.part) as fraction
      from public.leave_requests r
      join days dd on dd.d between r.start_date and r.end_date
      cross join lateral (select case
               when r.start_date = r.end_date then (case when r.start_period <> 'full' then r.start_period else r.end_period end)
               when dd.d = r.start_date then r.start_period
               when dd.d = r.end_date then r.end_period
               else 'full'::public.leave_day_period end as part) x
     where r.user_id = p_user and r.status in ('pending', 'approved')
     order by dd.d, (r.status = 'approved') desc, r.created_at
  )
  select dd.d,
         k.kind,
         case k.kind
           when 'flex' then q.fraction
           when 'pend' then q.fraction
           when 'auto' then case when w.holiday_half then 0.5 else 1 end
           else 0 end::numeric,
         extract(isodow from dd.d)::smallint,
         case when k.kind in ('flex', 'pend') then q.id end,
         w.holiday_name
    from days dd
    cross join b
    cross join lateral app.work_day(p_user, dd.d) w
    left join att a on a.d = dd.d
    left join req q on q.d = dd.d
    cross join lateral (select case
             when w.holiday_id is not null and not w.holiday_half then 'holiday'
             when a.d is not null then 'worked'
             when q.leave_type = 'flex' and q.status = 'approved' then 'flex'
             when q.leave_type = 'flex' then 'pend'
             when q.status = 'approved' then 'leave'
             when dd.d >= b.today then 'upcoming'
             else 'auto' end as kind) k
   where app.day_off_mode(p_user, dd.d) = 'flexible'
     and ((select employment_date from u) is null or dd.d >= (select employment_date from u))
   order by dd.d;
$$;

-- Internal: a cycle's live numbers. Weekend days count only while the
-- person is on flexible days off and employed.
create function app.flex_numbers(p_user uuid, p_start date, p_end date)
returns table (saturdays integer, sundays integer, allowance numeric, requested numeric, auto_days numeric, planned numeric)
language sql
stable
security definer
set search_path = ''
as $$
  with d as (select * from app.flex_days_raw(p_user, p_start, p_end)),
       s as (select coalesce(flex_saturday_rate, 0.5) as sat, coalesce(flex_sunday_rate, 1) as sun from public.app_settings limit 1)
  select
    (select count(*) from d where weekday = 6)::integer,
    (select count(*) from d where weekday = 7)::integer,
    (select count(*) from d where weekday = 6) * s.sat + (select count(*) from d where weekday = 7) * s.sun,
    coalesce((select sum(cost) from d where kind = 'flex'), 0),
    coalesce((select sum(cost) from d where kind = 'auto'), 0),
    coalesce((select sum(cost) from d where kind = 'pend'), 0)
  from s;
$$;

create function app.can_see_flex(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user = auth.uid()
      or app.can('leave', 'view', p_user)
      or app.can('attendance', 'view', p_user)
      or app.can('leave_balance', 'view', p_user);
$$;

-- Per-day rows for the Days off calendar.
create function app.flex_days(p_user uuid, p_from date, p_to date)
returns table (day date, kind text, cost numeric, weekday smallint, request_id uuid, holiday_name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.can_see_flex(p_user) then
    raise exception 'insufficient_privilege';
  end if;
  if p_to < p_from or p_to - p_from > 62 then
    raise exception 'invalid_range' using detail = 'Ask for at most 62 days.';
  end if;
  return query select * from app.flex_days_raw(p_user, p_from, p_to);
end;
$$;

-- One cycle (the one containing p_date) for a person: live numbers, or the
-- frozen settlement once it has settled.
create function app.flex_cycle(p_user uuid, p_date date)
returns table (
  cycle_start   date,
  cycle_end     date,
  close_day     integer,
  is_flexible   boolean,
  saturdays     integer,
  sundays       integer,
  sat_rate      numeric,
  sun_rate      numeric,
  allowance     numeric,
  requested     numeric,
  auto_days     numeric,
  taken         numeric,
  planned       numeric,
  left_days     numeric,
  closed        boolean,
  settled       boolean,
  settled_at    timestamptz,
  unused_days   numeric,
  over_days     numeric,
  annual_days   numeric,
  unpaid_days   numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_c     record;
  v_s     public.flex_settlements;
  v_n     record;
  v_today date := (now() at time zone 'Asia/Phnom_Penh')::date;
  v_set   record;
begin
  if not app.can_see_flex(p_user) then
    raise exception 'insufficient_privilege';
  end if;
  select * into v_c from app.cycle_bounds(coalesce(p_date, v_today));
  select a.attendance_cycle_close_day as close_day, a.flex_saturday_rate as sat, a.flex_sunday_rate as sun into v_set from public.app_settings a limit 1;
  select * into v_s from public.flex_settlements s where s.user_id = p_user and s.cycle_end = v_c.cycle_end;

  if v_s.user_id is not null then
    return query select v_c.cycle_start, v_c.cycle_end, v_set.close_day::integer, true, v_s.saturdays, v_s.sundays,
      v_set.sat, v_set.sun, v_s.allowance, v_s.requested, v_s.auto_days, v_s.requested + v_s.auto_days, 0::numeric,
      v_s.allowance - v_s.requested - v_s.auto_days, true, true, v_s.settled_at, v_s.unused_days, v_s.over_days, v_s.annual_days, v_s.unpaid_days;
    return;
  end if;

  select * into v_n from app.flex_numbers(p_user, v_c.cycle_start, v_c.cycle_end);
  return query select v_c.cycle_start, v_c.cycle_end, v_set.close_day::integer,
    app.day_off_mode(p_user, v_c.cycle_start) = 'flexible',
    v_n.saturdays, v_n.sundays, v_set.sat, v_set.sun, v_n.allowance, v_n.requested, v_n.auto_days,
    v_n.requested + v_n.auto_days, v_n.planned,
    v_n.allowance - v_n.requested - v_n.auto_days - v_n.planned,
    v_c.cycle_end < v_today, false, null::timestamptz,
    greatest(0, v_n.allowance - v_n.requested - v_n.auto_days - v_n.planned),
    greatest(0, v_n.requested + v_n.auto_days + v_n.planned - v_n.allowance),
    null::numeric, null::numeric;
end;
$$;

-- ---------------------------------------------------------------------------
-- Settlement
-- ---------------------------------------------------------------------------
-- Annual leave counts overdraws settled in that year.
create or replace function app.leave_used_days(p_user uuid, p_type public.leave_type, p_year integer)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
           select sum(coalesce(r.days, app.leave_request_days(r.user_id, r.start_date, r.end_date, r.start_period, r.end_period)))
             from public.leave_requests r
            where r.user_id = p_user
              and r.leave_type = p_type
              and r.status in ('pending', 'approved')
              and extract(year from r.start_date)::integer = p_year), 0)
       + case when p_type = 'annual' then coalesce((
           select sum(s.annual_days) from public.flex_settlements s
            where s.user_id = p_user and extract(year from s.cycle_end)::integer = p_year), 0)
         else 0 end;
$$;

comment on function app.leave_used_days is
  'Days of a leave type used in a year: pending + approved requests (working days), plus for annual leave the flexible days off taken beyond a cycle''s allowance (flex_settlements.annual_days).';

-- Settles every closed, unsettled cycle (up to ~6 back) that someone was on
-- flexible days off for. Run daily by pg_cron; safe to run again.
create function app.settle_flex_cycles()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today   date := (now() at time zone 'Asia/Phnom_Penh')::date;
  v_current record;
  v_person  record;
  v_c       record;
  v_n       record;
  v_d       date;
  v_used    numeric;
  v_over    numeric;
  v_left    numeric;
  v_annual  numeric;
  v_count   integer := 0;
begin
  select * into v_current from app.cycle_bounds(v_today);
  for v_person in
    select m.user_id, min(m.effective_from) as first_from
      from public.day_off_modes m
     where m.mode = 'flexible' and m.effective_from < v_current.cycle_start
     group by m.user_id
  loop
    v_d := greatest(v_person.first_from, v_current.cycle_start - 190);
    select * into v_c from app.cycle_bounds(v_d);
    while v_c.cycle_end < v_current.cycle_start loop
      if app.day_off_mode(v_person.user_id, v_c.cycle_start) = 'flexible'
         and not exists (select 1 from public.flex_settlements s where s.user_id = v_person.user_id and s.cycle_end = v_c.cycle_end) then
        select * into v_n from app.flex_numbers(v_person.user_id, v_c.cycle_start, v_c.cycle_end);
        -- A pending request still open at the close counts as taken.
        v_used := v_n.requested + v_n.planned + v_n.auto_days;
        v_over := greatest(0, v_used - v_n.allowance);
        v_annual := 0;
        if v_over > 0 then
          select e.quota_days - app.leave_used_days(v_person.user_id, 'annual', extract(year from v_c.cycle_end)::integer) into v_left
            from app.leave_entitlement(v_person.user_id, 'annual', extract(year from v_c.cycle_end)::integer) e;
          v_annual := least(v_over, greatest(0, coalesce(v_left, 0)));
        end if;
        insert into public.flex_settlements (user_id, cycle_start, cycle_end, saturdays, sundays, allowance, requested, auto_days, unused_days, over_days, annual_days, unpaid_days)
        values (v_person.user_id, v_c.cycle_start, v_c.cycle_end, v_n.saturdays, v_n.sundays, v_n.allowance, v_n.requested + v_n.planned, v_n.auto_days,
                greatest(0, v_n.allowance - v_used), v_over, v_annual, v_over - v_annual);
        v_count := v_count + 1;
      end if;
      select * into v_c from app.cycle_bounds(v_c.cycle_end + 1);
    end loop;
  end loop;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Requests, attendance and alerts
-- ---------------------------------------------------------------------------
create or replace function app.request_leave(
  p_leave_type   public.leave_type,
  p_start_date   date,
  p_end_date     date,
  p_start_period public.leave_day_period default 'full',
  p_end_period   public.leave_day_period default 'full',
  p_reason       text default null
)
returns public.leave_requests
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_me    uuid := auth.uid();
  v_days  numeric;
  v_year  integer := extract(year from p_start_date)::integer;
  v_quota numeric;
  v_used  numeric;
  v_row   public.leave_requests;
begin
  if not app.can('leave', 'add', v_me) then
    raise exception 'insufficient_privilege';
  end if;

  if p_end_date < p_start_date then
    raise exception 'invalid_range' using detail = 'The end date is before the start date.';
  end if;

  -- Flexible days off are for people on flexible days off, on dates they're
  -- on it. There's no cap: going over the cycle's allowance is allowed and
  -- settles from annual leave at the close.
  if p_leave_type = 'flex' and exists (
    select 1 from generate_series(p_start_date, p_end_date, interval '1 day') g
     where app.day_off_mode(v_me, g::date) <> 'flexible'
  ) then
    raise exception 'not_flexible' using detail = 'Flexible days off are only for people on Flexible (travel) days off. Pick annual, sick or unpaid leave instead.';
  end if;

  v_days := app.leave_request_days(v_me, p_start_date, p_end_date, p_start_period, p_end_period);
  if v_days <= 0 then
    raise exception 'invalid_range' using detail = 'Those dates are all days off or public holidays -- there is nothing to take leave from.';
  end if;

  if exists (
    select 1 from public.leave_requests r
     where r.user_id = v_me
       and r.status in ('pending', 'approved')
       and r.start_date <= p_end_date and r.end_date >= p_start_date
  ) then
    raise exception 'overlapping_request' using detail = 'This overlaps a leave request you already have pending or approved.';
  end if;

  if p_leave_type in ('annual', 'sick') then
    select e.quota_days into v_quota from app.leave_entitlement(v_me, p_leave_type, v_year) e;
    v_used := app.leave_used_days(v_me, p_leave_type, v_year);

    if coalesce(v_quota, 0) - v_used - v_days < 0 then
      raise exception 'over_quota' using detail = format('This would use %s working day(s), but only %s remain for %s leave this year.', v_days, greatest(coalesce(v_quota, 0) - v_used, 0), p_leave_type);
    end if;
  end if;

  insert into public.leave_requests (user_id, leave_type, start_date, end_date, start_period, end_period, reason, days)
  values (v_me, p_leave_type, p_start_date, p_end_date, p_start_period, p_end_period, p_reason, v_days)
  returning * into v_row;

  return v_row;
end;
$function$;

comment on function app.request_leave is
  'Submits a leave request for the caller, counted in working days (app.leave_request_days): rejects a range with no working days, an overlapping pending/approved request, (annual/sick) one that would exceed the remaining allowance (app.leave_entitlement), or a flexible day off for someone not on flexible days off on those dates.';

create or replace function app.attendance_days(p_from date, p_to date)
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
  'One row per active person the caller may view attendance for x date in [p_from, p_to] (max 62 days): status present/late/absent/dayoff/leave/holiday/off/upcoming (dayoff = a person on flexible days off didn''t clock in, using their allowance), late minutes, worked minutes (net of an unpaid break), approved leave and holiday.';

-- attendance_alerts: skip the "not clocked in yet" alert for people on
-- flexible days off -- a day without a clock-in is one of their days off.
do $$
declare
  v_def text := pg_get_functiondef('app.attendance_alerts()'::regprocedure);
  v_new text;
begin
  v_new := replace(v_def,
    E'     where u.status = ''active''\n       and w.is_working\n',
    E'     where u.status = ''active''\n       and w.is_working\n       and app.day_off_mode(u.id, n.ts::date) <> ''flexible''\n');
  if v_new = v_def then
    raise exception 'attendance_alerts: late_in filter not found';
  end if;
  execute v_new;
end;
$$;

-- calendar_items: a flexible day off reads "Day off", not "Flex leave".
do $$
declare
  v_def text := pg_get_functiondef('app.calendar_items(uuid, date, date)'::regprocedure);
  v_new text;
begin
  v_new := replace(v_def,
    $r$initcap(r.leave_type::text) || ' leave'$r$,
    $r$case when r.leave_type = 'flex' then 'Day off' else initcap(r.leave_type::text) || ' leave' end$r$);
  if v_new = v_def then
    raise exception 'calendar_items: leave title not found';
  end if;
  execute v_new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Setting a person's rule, and the company rates
-- ---------------------------------------------------------------------------
-- Effective from the next cycle, or (p_this_cycle) the current one, which is
-- then counted under the new rule. Any change already scheduled from that
-- date on is replaced. Returns the date it takes effect, or null when the
-- person is already on that rule then.
create function app.set_day_off_mode(p_user uuid, p_mode text, p_this_cycle boolean default false)
returns date
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c    record;
  v_from date;
begin
  if not app.can('user', 'edit', p_user) then
    raise exception 'insufficient_privilege';
  end if;
  if p_mode not in ('company', 'flexible') then
    raise exception 'invalid_mode' using detail = 'Pick Company schedule or Flexible (travel).';
  end if;
  select * into v_c from app.cycle_bounds((now() at time zone 'Asia/Phnom_Penh')::date);
  v_from := case when coalesce(p_this_cycle, false) then v_c.cycle_start else v_c.cycle_end + 1 end;

  delete from public.day_off_modes where user_id = p_user and effective_from >= v_from;
  if app.day_off_mode(p_user, v_from) = p_mode then
    return null;
  end if;
  insert into public.day_off_modes (user_id, effective_from, mode, set_by) values (p_user, v_from, p_mode, auth.uid());
  return v_from;
end;
$$;

create function app.day_off_mode_info(p_user uuid)
returns table (mode text, next_mode text, next_from date, cycle_start date, next_cycle_start date)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Asia/Phnom_Penh')::date;
  v_c     record;
begin
  if not (p_user = auth.uid() or app.can('user', 'view', p_user) or app.can_see_flex(p_user)) then
    raise exception 'insufficient_privilege';
  end if;
  select * into v_c from app.cycle_bounds(v_today);
  return query
    select app.day_off_mode(p_user, v_today),
           n.mode, n.effective_from, v_c.cycle_start, v_c.cycle_end + 1
      from (select 1) one
      left join lateral (
        select m.mode, m.effective_from from public.day_off_modes m
         where m.user_id = p_user and m.effective_from > v_today
         order by m.effective_from limit 1) n on true;
end;
$$;

create function app.set_flex_rates(p_sat numeric, p_sun numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app.can('settings', 'edit') then
    raise exception 'insufficient_privilege';
  end if;
  if p_sat < 0 or p_sat > 2 or p_sun < 0 or p_sun > 2 or p_sat * 2 <> trunc(p_sat * 2) or p_sun * 2 <> trunc(p_sun * 2) then
    raise exception 'invalid_rate' using detail = 'A weekend day earns 0 to 2 days, in half days.';
  end if;
  update public.app_settings set flex_saturday_rate = p_sat, flex_sunday_rate = p_sun, updated_at = now(), updated_by = auth.uid() where id = true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Public API
-- ---------------------------------------------------------------------------
create function public.flex_cycle(p_user uuid default null, p_date date default null)
returns table (
  cycle_start date, cycle_end date, close_day integer, is_flexible boolean, saturdays integer, sundays integer,
  sat_rate numeric, sun_rate numeric, allowance numeric, requested numeric, auto_days numeric, taken numeric,
  planned numeric, left_days numeric, closed boolean, settled boolean, settled_at timestamptz,
  unused_days numeric, over_days numeric, annual_days numeric, unpaid_days numeric
)
language sql
stable
set search_path = ''
as $$ select * from app.flex_cycle(coalesce(p_user, auth.uid()), p_date); $$;

create function public.flex_days(p_user uuid, p_from date, p_to date)
returns table (day date, kind text, cost numeric, weekday smallint, request_id uuid, holiday_name text)
language sql
stable
set search_path = ''
as $$ select * from app.flex_days(coalesce(p_user, auth.uid()), p_from, p_to); $$;

create function public.day_off_mode_info(p_user uuid default null)
returns table (mode text, next_mode text, next_from date, cycle_start date, next_cycle_start date)
language sql
stable
set search_path = ''
as $$ select * from app.day_off_mode_info(coalesce(p_user, auth.uid())); $$;

create function public.set_day_off_mode(p_user uuid, p_mode text, p_this_cycle boolean default false)
returns date
language sql
set search_path = ''
as $$ select app.set_day_off_mode(p_user, p_mode, p_this_cycle); $$;

create function app.flex_settings()
returns table (close_day integer, sat_rate numeric, sun_rate numeric, flexible_people integer)
language sql
stable
security definer
set search_path = ''
as $$
  select a.attendance_cycle_close_day::integer, a.flex_saturday_rate, a.flex_sunday_rate,
         (select count(*)::integer from public.users u
           where u.status = 'active'
             and (app.day_off_mode(u.id, (now() at time zone 'Asia/Phnom_Penh')::date) = 'flexible'
                  or exists (select 1 from public.day_off_modes m where m.user_id = u.id and m.mode = 'flexible' and m.effective_from > (now() at time zone 'Asia/Phnom_Penh')::date)))
    from public.app_settings a limit 1;
$$;

create function public.flex_settings()
returns table (close_day integer, sat_rate numeric, sun_rate numeric, flexible_people integer)
language sql
stable
set search_path = ''
as $$ select * from app.flex_settings(); $$;

create function public.set_flex_rates(p_sat numeric, p_sun numeric)
returns void
language sql
set search_path = ''
as $$ select app.set_flex_rates(p_sat, p_sun); $$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke execute on function app.cycle_bounds(date) from public;
revoke execute on function app.day_off_mode(uuid, date) from public;
revoke execute on function app.flex_days_raw(uuid, date, date) from public;
revoke execute on function app.flex_numbers(uuid, date, date) from public;
revoke execute on function app.can_see_flex(uuid) from public;
revoke execute on function app.flex_days(uuid, date, date) from public;
revoke execute on function app.flex_cycle(uuid, date) from public;
revoke execute on function app.settle_flex_cycles() from public;
revoke execute on function app.set_day_off_mode(uuid, text, boolean) from public;
revoke execute on function app.day_off_mode_info(uuid) from public;
revoke execute on function app.set_flex_rates(numeric, numeric) from public;
revoke execute on function app.flex_settings() from public;
revoke execute on function public.flex_cycle(uuid, date) from public;
revoke execute on function public.flex_days(uuid, date, date) from public;
revoke execute on function public.day_off_mode_info(uuid) from public;
revoke execute on function public.set_day_off_mode(uuid, text, boolean) from public;
revoke execute on function public.flex_settings() from public;
revoke execute on function public.set_flex_rates(numeric, numeric) from public;

grant execute on function app.cycle_bounds(date) to authenticated;
grant execute on function app.day_off_mode(uuid, date) to authenticated;
grant execute on function app.can_see_flex(uuid) to authenticated;
grant execute on function app.flex_days(uuid, date, date) to authenticated;
grant execute on function app.flex_cycle(uuid, date) to authenticated;
grant execute on function app.set_day_off_mode(uuid, text, boolean) to authenticated;
grant execute on function app.day_off_mode_info(uuid) to authenticated;
grant execute on function app.set_flex_rates(numeric, numeric) to authenticated;
grant execute on function app.flex_settings() to authenticated;
grant execute on function public.flex_cycle(uuid, date) to authenticated;
grant execute on function public.flex_days(uuid, date, date) to authenticated;
grant execute on function public.day_off_mode_info(uuid) to authenticated;
grant execute on function public.set_day_off_mode(uuid, text, boolean) to authenticated;
grant execute on function public.flex_settings() to authenticated;
grant execute on function public.set_flex_rates(numeric, numeric) to authenticated;

-- Settle closed cycles every day at 00:30 Phnom Penh time.
select cron.schedule('settle-flex-days-off', '30 17 * * *', $$select app.settle_flex_cycles();$$);
