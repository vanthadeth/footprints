-- Footprints: flexible days off by a minimum number of working days.
--
-- 0100 gave people on flexible days off an allowance of days off earned by
-- working Saturdays and Sundays. The rule is now simpler: every person on
-- flexible days off has a MINIMUM number of working days per attendance
-- cycle (company default 20, optionally their own number).
--
--   worked   a day with a clock-in (weekends count)
--   credited approved leave, and public holidays (a half-day holiday counts ½)
--
-- When a cycle closes below the minimum, each missing day counts as absent
-- and leave is deducted: annual leave first, then unpaid. Nothing is
-- carried over. Only people on flexible days off (day_off_modes) are
-- affected; everyone else keeps the company working days.
--
-- Additive: new columns and NEW function names (flex_progress,
-- flex_progress_days, flex_team_progress, flex_rule_settings,
-- set_min_working_days), so the 0100/0101 functions keep working until the
-- app is updated. The only replaced function is app.settle_flex_cycles
-- (same name and return type), which now settles by the new rule. Cycles
-- already settled are untouched (their rows have min_days null).

-- ---------------------------------------------------------------------------
-- Settings and settlement columns
-- ---------------------------------------------------------------------------
alter table public.users
  add column min_working_days smallint check (min_working_days between 1 and 31);

alter table public.app_settings
  add column min_working_days smallint not null default 20 check (min_working_days between 1 and 31);

alter table public.flex_settlements
  add column min_days numeric(5,1),
  add column worked_days numeric(5,1),
  add column credited_days numeric(5,1);

comment on column public.users.min_working_days is 'Minimum working days per attendance cycle for this person on flexible days off; null uses app_settings.min_working_days.';
comment on column public.app_settings.min_working_days is 'Minimum working days per attendance cycle for people on flexible days off without their own users.min_working_days.';
comment on column public.flex_settlements.min_days is 'The minimum working days the cycle was settled against (0123); null on cycles settled by the old weekend-allowance rule.';
comment on column public.flex_settlements.worked_days is 'Days with a clock-in in the cycle (0123).';
comment on column public.flex_settlements.credited_days is 'Approved leave days and public holidays counted as worked in the cycle (0123).';

-- A person's minimum: their own, else the company default.
create function app.flex_min_days(p_user uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select u.min_working_days from public.users u where u.id = p_user),
    (select a.min_working_days from public.app_settings a limit 1),
    20)::integer;
$$;

-- ---------------------------------------------------------------------------
-- Per-day progress
-- ---------------------------------------------------------------------------
-- Internal (no permission check): one row per date a person is on flexible
-- days off (and employed) in [p_from, p_to].
--   kind      worked   clocked in                                  credit 1
--             holiday  a full public holiday                       credit 1
--             leave    approved leave (any type)                   credit = the leave fraction
--             pend     pending leave (not counted yet)             credit 0
--             upcoming today or later, nothing yet                 credit 0
--             missing  a past weekday with no clock-in             credit ½ on a half-day holiday, else 0
--             rest     a past weekend day with no clock-in         credit 0 (not required)
create function app.flex_progress_days_raw(p_user uuid, p_from date, p_to date)
returns table (day date, kind text, credit numeric, weekday smallint, holiday_name text)
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
    select distinct on (dd.d) dd.d, r.status,
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
           when 'worked' then 1
           when 'holiday' then 1
           when 'leave' then q.fraction
           when 'missing' then case when w.holiday_half then 0.5 else 0 end
           else 0 end::numeric,
         extract(isodow from dd.d)::smallint,
         w.holiday_name
    from days dd
    cross join b
    cross join lateral app.work_day(p_user, dd.d) w
    left join att a on a.d = dd.d
    left join req q on q.d = dd.d
    cross join lateral (select case
             when w.holiday_id is not null and not w.holiday_half then 'holiday'
             when a.d is not null then 'worked'
             when q.status = 'approved' then 'leave'
             when q.status = 'pending' then 'pend'
             when dd.d >= b.today then 'upcoming'
             when extract(isodow from dd.d) >= 6 then 'rest'
             else 'missing' end as kind) k
   where app.day_off_mode(p_user, dd.d) = 'flexible'
     and ((select employment_date from u) is null or dd.d >= (select employment_date from u))
   order by dd.d;
$$;

-- Per-day rows for the Working days calendar.
create function app.flex_progress_days(p_user uuid, p_from date, p_to date)
returns table (day date, kind text, credit numeric, weekday smallint, holiday_name text)
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
  return query select * from app.flex_progress_days_raw(p_user, p_from, p_to);
end;
$$;

-- Internal: a cycle's live numbers.
--   worked    days with a clock-in
--   credited  approved leave days + public holidays (+ ½ for a half-day holiday with no clock-in)
--   available days still to come where working is possible: today or later, not a holiday,
--             not approved leave (weekends included, since weekends can be worked)
create function app.flex_progress_numbers(p_user uuid, p_start date, p_end date)
returns table (worked numeric, credited numeric, available numeric)
language sql
stable
security definer
set search_path = ''
as $$
  with d as (select * from app.flex_progress_days_raw(p_user, p_start, p_end))
  select
    (select count(*) from d where kind = 'worked')::numeric,
    coalesce((select sum(credit) from d where kind in ('holiday', 'leave', 'missing')), 0),
    (select count(*) from d where kind in ('upcoming', 'pend'))::numeric;
$$;

-- One cycle (the one containing p_date) for a person: live numbers, or the
-- frozen settlement once it has settled. A settlement from before 0123 has
-- min_days null (the old weekend-allowance rule).
create function app.flex_progress(p_user uuid, p_date date)
returns table (
  cycle_start  date,
  cycle_end    date,
  close_day    integer,
  is_flexible  boolean,
  min_days     numeric,
  worked       numeric,
  credited     numeric,
  still_needed numeric,
  available    numeric,
  spare        numeric,
  closed       boolean,
  settled      boolean,
  settled_at   timestamptz,
  short_days   numeric,
  above_days   numeric,
  annual_days  numeric,
  unpaid_days  numeric
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
  v_min   numeric;
  v_need  numeric;
  v_today date := (now() at time zone 'Asia/Phnom_Penh')::date;
  v_close integer;
begin
  if not app.can_see_flex(p_user) then
    raise exception 'insufficient_privilege';
  end if;
  select * into v_c from app.cycle_bounds(coalesce(p_date, v_today));
  select a.attendance_cycle_close_day::integer into v_close from public.app_settings a limit 1;
  select * into v_s from public.flex_settlements s where s.user_id = p_user and s.cycle_end = v_c.cycle_end;

  if v_s.user_id is not null then
    return query select v_c.cycle_start, v_c.cycle_end, v_close, true,
      v_s.min_days, v_s.worked_days, v_s.credited_days,
      case when v_s.min_days is null then null else v_s.over_days end,
      0::numeric,
      case when v_s.min_days is null then null else -v_s.over_days end,
      true, true, v_s.settled_at,
      case when v_s.min_days is null then null else v_s.over_days end,
      case when v_s.min_days is null then null else v_s.unused_days end,
      v_s.annual_days, v_s.unpaid_days;
    return;
  end if;

  v_min := app.flex_min_days(p_user);
  select * into v_n from app.flex_progress_numbers(p_user, v_c.cycle_start, v_c.cycle_end);
  v_need := greatest(0, v_min - v_n.worked - v_n.credited);
  return query select v_c.cycle_start, v_c.cycle_end, v_close,
    app.day_off_mode(p_user, v_c.cycle_start) = 'flexible',
    v_min, v_n.worked, v_n.credited, v_need, v_n.available, v_n.available - v_need,
    v_c.cycle_end < v_today, false, null::timestamptz,
    greatest(0, v_need - v_n.available),
    greatest(0, v_n.worked + v_n.credited - v_min),
    null::numeric, null::numeric;
end;
$$;

comment on function app.flex_progress is
  'A person on flexible days off, for the cycle containing p_date: minimum working days, worked, credited (leave and holidays), still needed, days left to work and spare days; or the frozen settlement (short days, the annual and unpaid leave taken) once settled.';

-- Everyone on flexible days off (or starting it) the caller may see.
create function app.flex_team_progress(p_date date default null)
returns table (
  user_id         uuid,
  full_name       text,
  nickname        text,
  department_name text,
  is_flexible     boolean,
  next_from       date,
  cycle_start     date,
  cycle_end       date,
  min_days        numeric,
  worked          numeric,
  credited        numeric,
  still_needed    numeric,
  available       numeric,
  spare           numeric,
  settled         boolean,
  short_days      numeric,
  annual_days     numeric,
  unpaid_days     numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  with c as (
    select * from app.cycle_bounds(coalesce(p_date, (now() at time zone 'Asia/Phnom_Penh')::date))
  ),
  people as (
    select u.id, u.full_name, u.nickname, d.name as department_name,
           app.day_off_mode(u.id, (select cycle_start from c)) = 'flexible' as is_flexible,
           (select min(m.effective_from) from public.day_off_modes m
             where m.user_id = u.id and m.mode = 'flexible' and m.effective_from > (select cycle_start from c)) as next_from
      from public.users u
      left join public.departments d on d.id = u.department_id
     where u.status = 'active'
       and u.id <> auth.uid()
       and exists (select 1 from public.day_off_modes m where m.user_id = u.id and m.mode = 'flexible')
       and app.can_see_flex(u.id)
  )
  select p.id, p.full_name, p.nickname, p.department_name, p.is_flexible,
         case when p.is_flexible then null else p.next_from end,
         f.cycle_start, f.cycle_end, f.min_days, f.worked, f.credited, f.still_needed, f.available, f.spare,
         f.settled, f.short_days, f.annual_days, f.unpaid_days
    from people p
    cross join lateral app.flex_progress(p.id, p_date) f
   where p.is_flexible or p.next_from is not null
   order by p.full_name;
$$;

-- ---------------------------------------------------------------------------
-- Settlement by the new rule
-- ---------------------------------------------------------------------------
-- Settles every closed, unsettled cycle (up to ~6 back) that someone was on
-- flexible days off for. Run daily by pg_cron (0100); safe to run again.
-- short = minimum - worked - credited (never below 0). Each short day is an
-- absent day: annual leave first (what is left of the year's entitlement),
-- the rest unpaid. The old columns are filled so everything that reads
-- flex_settlements (app.leave_used_days adds annual_days) keeps working:
-- allowance = the minimum, auto_days and over_days = the short days,
-- unused_days = days above the minimum (not carried over).
create or replace function app.settle_flex_cycles()
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
  v_min     numeric;
  v_short   numeric;
  v_above   numeric;
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
        select * into v_n from app.flex_progress_numbers(v_person.user_id, v_c.cycle_start, v_c.cycle_end);
        v_min := app.flex_min_days(v_person.user_id);
        v_short := greatest(0, v_min - v_n.worked - v_n.credited);
        v_above := greatest(0, v_n.worked + v_n.credited - v_min);
        v_annual := 0;
        if v_short > 0 then
          select e.quota_days - app.leave_used_days(v_person.user_id, 'annual', extract(year from v_c.cycle_end)::integer) into v_left
            from app.leave_entitlement(v_person.user_id, 'annual', extract(year from v_c.cycle_end)::integer) e;
          v_annual := least(v_short, greatest(0, coalesce(v_left, 0)));
        end if;
        insert into public.flex_settlements
          (user_id, cycle_start, cycle_end, saturdays, sundays, allowance, requested, auto_days, unused_days, over_days, annual_days, unpaid_days,
           min_days, worked_days, credited_days)
        values
          (v_person.user_id, v_c.cycle_start, v_c.cycle_end, 0, 0, v_min, 0, v_short, v_above, v_short, v_annual, v_short - v_annual,
           v_min, v_n.worked, v_n.credited);
        v_count := v_count + 1;
      end if;
      select * into v_c from app.cycle_bounds(v_c.cycle_end + 1);
    end loop;
  end loop;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Setting the company default
-- ---------------------------------------------------------------------------
create function app.set_min_working_days(p_days integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app.can('settings', 'edit') then
    raise exception 'insufficient_privilege';
  end if;
  if p_days is null or p_days < 1 or p_days > 31 then
    raise exception 'invalid_days' using detail = 'The minimum is 1 to 31 working days a cycle.';
  end if;
  update public.app_settings set min_working_days = p_days, updated_at = now(), updated_by = auth.uid() where id = true;
end;
$$;

-- The rule's settings and how many people it covers.
create function app.flex_rule_settings()
returns table (close_day integer, min_days integer, flexible_people integer)
language sql
stable
security definer
set search_path = ''
as $$
  select a.attendance_cycle_close_day::integer, a.min_working_days::integer,
         (select count(*)::integer from public.users u
           where u.status = 'active'
             and (app.day_off_mode(u.id, (now() at time zone 'Asia/Phnom_Penh')::date) = 'flexible'
                  or exists (select 1 from public.day_off_modes m where m.user_id = u.id and m.mode = 'flexible' and m.effective_from > (now() at time zone 'Asia/Phnom_Penh')::date)))
    from public.app_settings a limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Public API
-- ---------------------------------------------------------------------------
create function public.flex_progress(p_user uuid default null, p_date date default null)
returns table (
  cycle_start date, cycle_end date, close_day integer, is_flexible boolean, min_days numeric, worked numeric,
  credited numeric, still_needed numeric, available numeric, spare numeric, closed boolean, settled boolean,
  settled_at timestamptz, short_days numeric, above_days numeric, annual_days numeric, unpaid_days numeric
)
language sql
stable
set search_path = ''
as $$ select * from app.flex_progress(coalesce(p_user, auth.uid()), p_date); $$;

create function public.flex_progress_days(p_user uuid, p_from date, p_to date)
returns table (day date, kind text, credit numeric, weekday smallint, holiday_name text)
language sql
stable
set search_path = ''
as $$ select * from app.flex_progress_days(coalesce(p_user, auth.uid()), p_from, p_to); $$;

create function public.flex_team_progress(p_date date default null)
returns table (
  user_id uuid, full_name text, nickname text, department_name text, is_flexible boolean, next_from date,
  cycle_start date, cycle_end date, min_days numeric, worked numeric, credited numeric, still_needed numeric,
  available numeric, spare numeric, settled boolean, short_days numeric, annual_days numeric, unpaid_days numeric
)
language sql
stable
set search_path = ''
as $$ select * from app.flex_team_progress(p_date); $$;

create function public.flex_rule_settings()
returns table (close_day integer, min_days integer, flexible_people integer)
language sql
stable
set search_path = ''
as $$ select * from app.flex_rule_settings(); $$;

create function public.set_min_working_days(p_days integer)
returns void
language sql
set search_path = ''
as $$ select app.set_min_working_days(p_days); $$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke execute on function app.flex_min_days(uuid) from public;
revoke execute on function app.flex_progress_days_raw(uuid, date, date) from public;
revoke execute on function app.flex_progress_days(uuid, date, date) from public;
revoke execute on function app.flex_progress_numbers(uuid, date, date) from public;
revoke execute on function app.flex_progress(uuid, date) from public;
revoke execute on function app.flex_team_progress(date) from public;
revoke execute on function app.set_min_working_days(integer) from public;
revoke execute on function app.flex_rule_settings() from public;
revoke execute on function public.flex_progress(uuid, date) from public;
revoke execute on function public.flex_progress_days(uuid, date, date) from public;
revoke execute on function public.flex_team_progress(date) from public;
revoke execute on function public.flex_rule_settings() from public;
revoke execute on function public.set_min_working_days(integer) from public;

grant execute on function app.flex_progress_days(uuid, date, date) to authenticated;
grant execute on function app.flex_progress(uuid, date) to authenticated;
grant execute on function app.flex_team_progress(date) to authenticated;
grant execute on function app.set_min_working_days(integer) to authenticated;
grant execute on function app.flex_rule_settings() to authenticated;
grant execute on function public.flex_progress(uuid, date) to authenticated;
grant execute on function public.flex_progress_days(uuid, date, date) to authenticated;
grant execute on function public.flex_team_progress(date) to authenticated;
grant execute on function public.flex_rule_settings() to authenticated;
grant execute on function public.set_min_working_days(integer) to authenticated;
