-- Footprints: leave allowances with a company default, and leave counted in
-- working days.
--
-- Before: every person needed a leave_balances row per type per year or
-- their quota was 0, and a request counted every calendar date in its range.
-- Now:
--   * app_settings carries the COMPANY DEFAULT (annual/sick days), a
--     pro-rata switch for people who join mid-year, and a carry-over cap
--     for unused annual days.
--   * a leave_balances row is a per-person OVERRIDE ("custom", with a note);
--     no row = the default. app.set_leave_allowance writes or clears it.
--   * app.leave_entitlement(user, type, year) = override or default
--     (pro-rated in the join year) + carry-over (annual only, from the
--     previous year's unused days, capped). leave_balance_summary is rebuilt
--     on it: one row per person x annual/sick x year.
--   * a request counts WORKING DAYS only -- app.leave_request_days walks the
--     range through app.work_day (0089), so weekends/days off for the
--     person's team and public holidays cost nothing, and a half-day holiday
--     leaves only the morning to take. The count is stored on the request
--     (leave_requests.days) when it's made, so later schedule/holiday edits
--     don't rewrite history.
-- No leave_balances or leave_requests rows exist yet (checked live), so
-- nothing needs backfilling.

alter table public.app_settings
  add column default_annual_leave_days numeric(4,1) not null default 18 check (default_annual_leave_days >= 0),
  add column default_sick_leave_days numeric(4,1) not null default 7 check (default_sick_leave_days >= 0),
  add column leave_prorata_new_joiners boolean not null default true,
  add column leave_carry_over_max_days numeric(4,1) not null default 0 check (leave_carry_over_max_days >= 0);

comment on column public.app_settings.default_annual_leave_days is 'Annual leave days a year for everyone without a custom allowance (leave_balances row).';
comment on column public.app_settings.default_sick_leave_days is 'Sick leave days a year for everyone without a custom allowance.';
comment on column public.app_settings.leave_prorata_new_joiners is 'In the year someone joins (users.employment_date), the default is scaled by the months left, rounded to half days.';
comment on column public.app_settings.leave_carry_over_max_days is 'Unused annual days that roll into the next year, at most this many. 0 = no carry-over.';

alter table public.leave_balances add column note text;
comment on table public.leave_balances is
  'A per-person override of the company default allowance (app_settings.default_*_leave_days) for one leave type and year, with a note saying why. No row = the default. Written via app.set_leave_allowance / app.set_leave_balance.';

alter table public.leave_requests add column days numeric(5,1);
comment on column public.leave_requests.days is 'Working days this request uses, computed by app.leave_request_days when it was made.';

-- ---------------------------------------------------------------------------
-- Day counting
-- ---------------------------------------------------------------------------
-- A new 5-argument overload; the old calendar-day
-- app.leave_request_days(date, date, period, period) is left in place but
-- no longer called by anything (request_leave and the summary view both
-- move to this one below).
create function app.leave_request_days(p_user uuid, p_start_date date, p_end_date date, p_start_period public.leave_day_period, p_end_period public.leave_day_period)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(
           (case when w.is_working and d.part in ('full', 'morning') then 0.5 else 0 end)
         + (case when w.is_working and not w.holiday_half and d.part in ('full', 'afternoon') then 0.5 else 0 end)
         ), 0)::numeric
    from (
      select g::date as day,
             case
               when p_start_date = p_end_date then (case when p_start_period <> 'full' then p_start_period else p_end_period end)
               when g::date = p_start_date then p_start_period
               when g::date = p_end_date then p_end_period
               else 'full'::public.leave_day_period
             end as part
        from generate_series(p_start_date, p_end_date, interval '1 day') g
    ) d
    cross join lateral app.work_day(p_user, d.day) w;
$$;

comment on function app.leave_request_days(uuid, date, date, public.leave_day_period, public.leave_day_period) is
  'Working days a leave request uses for p_user: each date in the range counts its available halves (none on a day off or full holiday, the morning only on a half-day holiday) that the request takes (full, or the morning/afternoon at either end).';

create function public.preview_leave_days(p_start_date date, p_end_date date, p_start_period public.leave_day_period default 'full', p_end_period public.leave_day_period default 'full')
returns numeric
language sql
stable
set search_path = ''
as $$
  select app.leave_request_days(auth.uid(), p_start_date, p_end_date, p_start_period, p_end_period);
$$;

-- ---------------------------------------------------------------------------
-- Entitlement
-- ---------------------------------------------------------------------------
create function app.leave_default_days(p_user uuid, p_type public.leave_type, p_year integer)
returns table (days numeric, prorated boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with s as (
    select case p_type when 'annual' then a.default_annual_leave_days when 'sick' then a.default_sick_leave_days else 0 end as base,
           a.leave_prorata_new_joiners as prorata
      from public.app_settings a limit 1
  ),
  j as (select u.employment_date from public.users u where u.id = p_user)
  select
    case
      when s.prorata and (select employment_date from j) is not null and extract(year from (select employment_date from j))::int = p_year
        then round(s.base * (13 - extract(month from (select employment_date from j))) / 12 * 2) / 2
      when s.prorata and (select employment_date from j) is not null and extract(year from (select employment_date from j))::int > p_year
        then 0
      else s.base
    end,
    s.prorata and (select employment_date from j) is not null and extract(year from (select employment_date from j))::int >= p_year
  from s;
$$;

create function app.leave_used_days(p_user uuid, p_type public.leave_type, p_year integer)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(coalesce(r.days, app.leave_request_days(r.user_id, r.start_date, r.end_date, r.start_period, r.end_period))), 0)
    from public.leave_requests r
   where r.user_id = p_user
     and r.leave_type = p_type
     and r.status in ('pending', 'approved')
     and extract(year from r.start_date)::integer = p_year;
$$;

create function app.leave_entitlement(p_user uuid, p_type public.leave_type, p_year integer)
returns table (quota_days numeric, default_days numeric, is_custom boolean, note text, carry_days numeric, prorated boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_override public.leave_balances;
  v_default  numeric;
  v_prorated boolean;
  v_carry    numeric := 0;
  v_cap      numeric;
  v_prev     numeric;
  v_prev_ovr numeric;
begin
  select * into v_override from public.leave_balances b where b.user_id = p_user and b.leave_type = p_type and b.year = p_year;
  select d.days, d.prorated into v_default, v_prorated from app.leave_default_days(p_user, p_type, p_year) d;

  if p_type = 'annual' then
    select leave_carry_over_max_days into v_cap from public.app_settings limit 1;
    if coalesce(v_cap, 0) > 0 then
      select b.quota_days into v_prev_ovr from public.leave_balances b where b.user_id = p_user and b.leave_type = 'annual' and b.year = p_year - 1;
      select coalesce(v_prev_ovr, d.days) into v_prev from app.leave_default_days(p_user, 'annual', p_year - 1) d;
      v_carry := least(v_cap, greatest(0, coalesce(v_prev, 0) - app.leave_used_days(p_user, 'annual', p_year - 1)));
    end if;
  end if;

  return query select
    coalesce(v_override.quota_days, v_default, 0) + v_carry,
    coalesce(v_default, 0),
    v_override.user_id is not null,
    v_override.note,
    v_carry,
    coalesce(v_prorated, false) and v_override.user_id is null;
end;
$$;

comment on function app.leave_entitlement is
  'A person''s allowance for a leave type and year: their custom override (leave_balances) or the company default (pro-rated in their join year), plus annual carry-over from last year''s unused days up to leave_carry_over_max_days.';

-- Replaced in place: the first six columns keep their names and types
-- (quota_days stays numeric(4,1)), the rest are new columns on the end.
create or replace view public.leave_balance_summary
  with (security_invoker = true)
  as
  select
    u.id as user_id,
    t.leave_type,
    y.year::integer as year,
    e.quota_days::numeric(4,1) as quota_days,
    app.leave_used_days(u.id, t.leave_type, y.year::integer) as used_days,
    e.quota_days - app.leave_used_days(u.id, t.leave_type, y.year::integer) as remaining_days,
    e.default_days,
    e.is_custom,
    e.note,
    e.carry_days,
    e.prorated
  from public.users u
  cross join (values ('annual'::public.leave_type), ('sick'::public.leave_type)) as t(leave_type)
  cross join generate_series(extract(year from now())::integer - 2, extract(year from now())::integer + 1) as y(year)
  cross join lateral app.leave_entitlement(u.id, t.leave_type, y.year::integer) e
  where app.can('leave_balance', 'view', u.id);

comment on view public.leave_balance_summary is
  'Per person x annual/sick x year (last two years to next year): allowance (custom or default, + carry-over), days used (pending + approved, in working days) and remaining. Rows limited to people the caller may view leave balances for.';

grant select on public.leave_balance_summary to authenticated;

-- ---------------------------------------------------------------------------
-- Writes
-- ---------------------------------------------------------------------------
-- Same argument types as before, so it is replaced in place.
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
  'Submits a leave request for the caller, counted in working days (app.leave_request_days): rejects a range with no working days, an overlapping pending/approved request, or (annual/sick) one that would exceed the remaining allowance (app.leave_entitlement).';

create or replace function public.request_leave(p_leave_type public.leave_type, p_start_date date, p_end_date date, p_start_period public.leave_day_period default 'full', p_end_period public.leave_day_period default 'full', p_reason text default null)
returns public.leave_requests
language sql
set search_path to ''
as $function$ select * from app.request_leave(p_leave_type, p_start_date, p_end_date, p_start_period, p_end_period, p_reason); $function$;

-- Set (or, with a null quota, clear back to the default) one person's
-- allowance for a type and year.
create function app.set_leave_allowance(p_user_id uuid, p_leave_type public.leave_type, p_year integer, p_quota_days numeric, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app.can('leave_balance', 'edit', p_user_id) then
    raise exception 'insufficient_privilege';
  end if;
  if p_leave_type not in ('annual', 'sick') then
    raise exception 'invalid_leave_type' using detail = 'Only annual and sick leave have an allowance.';
  end if;

  if p_quota_days is null then
    delete from public.leave_balances where user_id = p_user_id and leave_type = p_leave_type and year = p_year;
    return;
  end if;
  if p_quota_days < 0 or p_quota_days > 365 then
    raise exception 'invalid_quota' using detail = 'An allowance must be between 0 and 365 days.';
  end if;

  insert into public.leave_balances (user_id, leave_type, year, quota_days, note, updated_by)
  values (p_user_id, p_leave_type, p_year, p_quota_days, nullif(btrim(coalesce(p_note, '')), ''), auth.uid())
  on conflict (user_id, leave_type, year)
  do update set quota_days = excluded.quota_days, note = excluded.note, updated_by = excluded.updated_by, updated_at = now();
end;
$$;

create function public.set_leave_allowance(p_user_id uuid, p_leave_type public.leave_type, p_year integer, p_quota_days numeric, p_note text default null)
returns void
language sql
set search_path = ''
as $$ select app.set_leave_allowance(p_user_id, p_leave_type, p_year, p_quota_days, p_note); $$;

-- Company default allowance + rules. HR/Super Admin (leave_balance:edit),
-- security definer because app_settings itself is settings:edit only.
create function app.set_leave_policy(p_annual numeric, p_sick numeric, p_prorata boolean, p_carry_max numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app.can('leave_balance', 'edit') then
    raise exception 'insufficient_privilege';
  end if;
  if p_annual < 0 or p_sick < 0 or p_carry_max < 0 or p_annual > 365 or p_sick > 365 then
    raise exception 'invalid_quota' using detail = 'Allowances must be between 0 and 365 days.';
  end if;
  update public.app_settings
     set default_annual_leave_days = p_annual,
         default_sick_leave_days = p_sick,
         leave_prorata_new_joiners = coalesce(p_prorata, true),
         leave_carry_over_max_days = p_carry_max,
         updated_at = now(),
         updated_by = auth.uid()
   where id = true;
end;
$$;

create function public.set_leave_policy(p_annual numeric, p_sick numeric, p_prorata boolean, p_carry_max numeric)
returns void
language sql
set search_path = ''
as $$ select app.set_leave_policy(p_annual, p_sick, p_prorata, p_carry_max); $$;

-- Read the company leave policy (app_settings is readable already, but this
-- keeps the leave screens off the settings row's full column list).
create function public.leave_policy()
returns table (default_annual_days numeric, default_sick_days numeric, prorata_new_joiners boolean, carry_over_max_days numeric)
language sql
stable
set search_path = ''
as $$
  select default_annual_leave_days, default_sick_leave_days, leave_prorata_new_joiners, leave_carry_over_max_days from public.app_settings limit 1;
$$;

revoke execute on function app.leave_request_days(uuid, date, date, public.leave_day_period, public.leave_day_period) from public;
revoke execute on function public.preview_leave_days(date, date, public.leave_day_period, public.leave_day_period) from public;
revoke execute on function app.leave_default_days(uuid, public.leave_type, integer) from public;
revoke execute on function app.leave_used_days(uuid, public.leave_type, integer) from public;
revoke execute on function app.leave_entitlement(uuid, public.leave_type, integer) from public;
revoke execute on function app.request_leave(public.leave_type, date, date, public.leave_day_period, public.leave_day_period, text) from public;
revoke execute on function public.request_leave(public.leave_type, date, date, public.leave_day_period, public.leave_day_period, text) from public;
revoke execute on function app.set_leave_allowance(uuid, public.leave_type, integer, numeric, text) from public;
revoke execute on function public.set_leave_allowance(uuid, public.leave_type, integer, numeric, text) from public;
revoke execute on function app.set_leave_policy(numeric, numeric, boolean, numeric) from public;
revoke execute on function public.set_leave_policy(numeric, numeric, boolean, numeric) from public;
revoke execute on function public.leave_policy() from public;

grant execute on function app.leave_request_days(uuid, date, date, public.leave_day_period, public.leave_day_period) to authenticated;
grant execute on function public.preview_leave_days(date, date, public.leave_day_period, public.leave_day_period) to authenticated;
grant execute on function app.leave_default_days(uuid, public.leave_type, integer) to authenticated;
grant execute on function app.leave_used_days(uuid, public.leave_type, integer) to authenticated;
grant execute on function app.leave_entitlement(uuid, public.leave_type, integer) to authenticated;
grant execute on function app.request_leave(public.leave_type, date, date, public.leave_day_period, public.leave_day_period, text) to authenticated;
grant execute on function public.request_leave(public.leave_type, date, date, public.leave_day_period, public.leave_day_period, text) to authenticated;
grant execute on function app.set_leave_allowance(uuid, public.leave_type, integer, numeric, text) to authenticated;
grant execute on function public.set_leave_allowance(uuid, public.leave_type, integer, numeric, text) to authenticated;
grant execute on function app.set_leave_policy(numeric, numeric, boolean, numeric) to authenticated;
grant execute on function public.set_leave_policy(numeric, numeric, boolean, numeric) to authenticated;
grant execute on function public.leave_policy() to authenticated;
