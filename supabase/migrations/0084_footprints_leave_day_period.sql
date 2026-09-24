-- Footprints: Leave Management -- replace half-day booleans with an
-- explicit Full/Morning/Afternoon selection per end of the range.
--
-- The original start_half_day/end_half_day booleans hardcoded which half
-- was excluded (afternoon-only for a half-day start, morning-only for a
-- half-day end) with no way to pick the other half. The request form now
-- lets a person choose Full Day / Morning / Afternoon directly for each
-- end, so the schema needs to carry which half, not just whether it's a
-- half. No real rows exist yet (checked live), so this is a straight
-- replace, not a backfill.

create type public.leave_day_period as enum ('full', 'morning', 'afternoon');
comment on type public.leave_day_period is 'Which portion of a leave request''s start/end date is taken -- morning/afternoon each count as half a day (see app.leave_request_days).';

-- leave_balance_summary reads start_half_day/end_half_day directly (via
-- app.leave_request_days), so both the view and that function must be
-- dropped before the columns/signature they depend on can change.
drop view public.leave_balance_summary;
drop function app.leave_request_days(date, date, boolean, boolean);

alter table public.leave_requests
  add column start_period public.leave_day_period not null default 'full',
  add column end_period public.leave_day_period not null default 'full';

alter table public.leave_requests drop column start_half_day;
alter table public.leave_requests drop column end_half_day;

comment on table public.leave_requests is
  'One leave request, full-day or half-day (morning/afternoon) at either end (start_period/end_period -- see app.leave_request_days for the day-count formula). Written only via app.request_leave/cancel_leave_request/decide_leave_request, which enforce quota, overlap, and no-self-approval rules beyond what RLS alone can express.';

create function app.leave_request_days(p_start_date date, p_end_date date, p_start_period public.leave_day_period, p_end_period public.leave_day_period)
returns numeric
language sql
immutable
set search_path to ''
as $function$
  select (p_end_date - p_start_date + 1)
       - (case when p_start_period <> 'full' then 0.5 else 0 end)
       - (case when p_end_period <> 'full' then 0.5 else 0 end);
$function$;

comment on function app.leave_request_days is
  'Day count for a leave request: whole days in [start_date, end_date], minus 0.5 for a morning-only or afternoon-only start and/or end.';

create view public.leave_balance_summary
  with (security_invoker = true)
  as
  select
    b.user_id,
    b.leave_type,
    b.year,
    b.quota_days,
    coalesce(used.days, 0) as used_days,
    b.quota_days - coalesce(used.days, 0) as remaining_days
  from public.leave_balances b
  left join lateral (
    select sum(app.leave_request_days(r.start_date, r.end_date, r.start_period, r.end_period)) as days
    from public.leave_requests r
    where r.user_id = b.user_id
      and r.leave_type = b.leave_type
      and r.status in ('pending', 'approved')
      and extract(year from r.start_date)::integer = b.year
  ) used on true;

comment on view public.leave_balance_summary is
  'quota_days minus days already pending/approved this year, per user/leave_type/year. Relies on app.leave_request_days for the day-count math.';

-- app.request_leave's own parameter list changes (booleans -> periods), so
-- drop + recreate rather than create or replace (which requires the same
-- argument types to replace in place).
drop function public.request_leave(public.leave_type, date, date, boolean, boolean, text);
drop function app.request_leave(public.leave_type, date, date, boolean, boolean, text);

create function app.request_leave(
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
  v_me         uuid := auth.uid();
  v_days       numeric;
  v_year       integer := extract(year from p_start_date)::integer;
  v_quota      numeric;
  v_used       numeric;
  v_row        public.leave_requests;
begin
  if not app.can('leave', 'add', v_me) then
    raise exception 'insufficient_privilege';
  end if;

  v_days := app.leave_request_days(p_start_date, p_end_date, p_start_period, p_end_period);
  if v_days <= 0 then
    raise exception 'invalid_range' using detail = 'A leave request must cover at least half a day.';
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
    select coalesce(quota_days, 0) into v_quota
      from public.leave_balances
     where user_id = v_me and leave_type = p_leave_type and year = v_year;

    select coalesce(sum(app.leave_request_days(r.start_date, r.end_date, r.start_period, r.end_period)), 0) into v_used
      from public.leave_requests r
     where r.user_id = v_me
       and r.leave_type = p_leave_type
       and r.status in ('pending', 'approved')
       and extract(year from r.start_date)::integer = v_year;

    if coalesce(v_quota, 0) - v_used - v_days < 0 then
      raise exception 'over_quota' using detail = format('This would use %s day(s), but only %s remain for %s leave this year.', v_days, greatest(coalesce(v_quota, 0) - v_used, 0), p_leave_type);
    end if;
  end if;

  insert into public.leave_requests (user_id, leave_type, start_date, end_date, start_period, end_period, reason)
  values (v_me, p_leave_type, p_start_date, p_end_date, p_start_period, p_end_period, p_reason)
  returning * into v_row;

  return v_row;
end;
$function$;

comment on function app.request_leave is
  'Submits a leave request for the caller: rejects a non-positive day count, an overlapping pending/approved request, or (for annual/sick) a request that would exceed the caller''s remaining quota for that year.';

create function public.request_leave(p_leave_type public.leave_type, p_start_date date, p_end_date date, p_start_period public.leave_day_period default 'full', p_end_period public.leave_day_period default 'full', p_reason text default null)
returns public.leave_requests
language sql
set search_path to ''
as $function$ select * from app.request_leave(p_leave_type, p_start_date, p_end_date, p_start_period, p_end_period, p_reason); $function$;

revoke execute on function app.request_leave(public.leave_type, date, date, public.leave_day_period, public.leave_day_period, text) from public;
revoke execute on function public.request_leave(public.leave_type, date, date, public.leave_day_period, public.leave_day_period, text) from public;
grant execute on function app.request_leave(public.leave_type, date, date, public.leave_day_period, public.leave_day_period, text) to authenticated;
grant execute on function public.request_leave(public.leave_type, date, date, public.leave_day_period, public.leave_day_period, text) to authenticated;
