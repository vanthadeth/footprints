-- Footprints: Leave Management -- request/cancel/decide/balance RPCs.
--
-- Same shape as clock_in/clock_out/checkin: business rules that RLS alone
-- can't express (quota, overlap, no-self-approval) live in security
-- definer app.* functions, each with a thin public.* wrapper (the
-- convention every prior migration in this repo already follows). This
-- environment's migration-apply role grants EXECUTE to PUBLIC by default
-- (see 0068's comment) -- revoke it and grant only to authenticated.

create function app.request_leave(
  p_leave_type      public.leave_type,
  p_start_date      date,
  p_end_date        date,
  p_start_half_day  boolean default false,
  p_end_half_day    boolean default false,
  p_reason          text default null
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

  v_days := app.leave_request_days(p_start_date, p_end_date, p_start_half_day, p_end_half_day);
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

    select coalesce(sum(app.leave_request_days(r.start_date, r.end_date, r.start_half_day, r.end_half_day)), 0) into v_used
      from public.leave_requests r
     where r.user_id = v_me
       and r.leave_type = p_leave_type
       and r.status in ('pending', 'approved')
       and extract(year from r.start_date)::integer = v_year;

    if coalesce(v_quota, 0) - v_used - v_days < 0 then
      raise exception 'over_quota' using detail = format('This would use %s day(s), but only %s remain for %s leave this year.', v_days, greatest(coalesce(v_quota, 0) - v_used, 0), p_leave_type);
    end if;
  end if;

  insert into public.leave_requests (user_id, leave_type, start_date, end_date, start_half_day, end_half_day, reason)
  values (v_me, p_leave_type, p_start_date, p_end_date, p_start_half_day, p_end_half_day, p_reason)
  returning * into v_row;

  return v_row;
end;
$function$;

comment on function app.request_leave is
  'Submits a leave request for the caller: rejects a non-positive day count, an overlapping pending/approved request, or (for annual/sick) a request that would exceed the caller''s remaining quota for that year.';

create function app.cancel_leave_request(p_id uuid)
returns public.leave_requests
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_me  uuid := auth.uid();
  v_row public.leave_requests;
begin
  select * into v_row from public.leave_requests where id = p_id;
  if not found then
    raise exception 'not_found';
  end if;
  if v_row.user_id <> v_me then
    raise exception 'insufficient_privilege' using detail = 'Only the requester can cancel their own leave request.';
  end if;
  if v_row.status <> 'pending' then
    raise exception 'invalid_state' using detail = 'Only a pending request can be cancelled.';
  end if;

  update public.leave_requests set status = 'cancelled', updated_at = now() where id = p_id returning * into v_row;
  return v_row;
end;
$function$;

comment on function app.cancel_leave_request is
  'The requester withdraws their own leave request, only while it is still pending.';

create function app.decide_leave_request(p_id uuid, p_approve boolean, p_note text default null)
returns public.leave_requests
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_me  uuid := auth.uid();
  v_row public.leave_requests;
begin
  select * into v_row from public.leave_requests where id = p_id;
  if not found then
    raise exception 'not_found';
  end if;
  if v_row.status <> 'pending' then
    raise exception 'invalid_state' using detail = 'This request has already been decided.';
  end if;
  if v_row.user_id = v_me then
    raise exception 'insufficient_privilege' using detail = 'You cannot approve or reject your own leave request.';
  end if;
  if not app.can('leave', 'edit', v_row.user_id) then
    raise exception 'insufficient_privilege';
  end if;

  update public.leave_requests
     set status = case when p_approve then 'approved'::public.leave_status else 'rejected'::public.leave_status end,
         decided_by = v_me,
         decided_at = now(),
         decision_note = p_note,
         updated_at = now()
   where id = p_id
   returning * into v_row;

  return v_row;
end;
$function$;

comment on function app.decide_leave_request is
  'A manager (of the requester''s chain)/HR/Super Admin approves or rejects a still-pending request. Self-approval is explicitly blocked regardless of scope.';

create function app.set_leave_balance(p_user_id uuid, p_leave_type public.leave_type, p_year integer, p_quota_days numeric)
returns public.leave_balances
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_row public.leave_balances;
begin
  if not app.can('leave_balance', 'edit', p_user_id) then
    raise exception 'insufficient_privilege';
  end if;

  insert into public.leave_balances (user_id, leave_type, year, quota_days, updated_by)
  values (p_user_id, p_leave_type, p_year, p_quota_days, auth.uid())
  on conflict (user_id, leave_type, year)
  do update set quota_days = excluded.quota_days, updated_by = excluded.updated_by, updated_at = now()
  returning * into v_row;

  return v_row;
end;
$function$;

comment on function app.set_leave_balance is
  'HR/Super Admin sets a user''s Annual/Sick quota for a given year (upsert).';

create function public.request_leave(p_leave_type public.leave_type, p_start_date date, p_end_date date, p_start_half_day boolean default false, p_end_half_day boolean default false, p_reason text default null)
returns public.leave_requests
language sql
set search_path to ''
as $function$ select * from app.request_leave(p_leave_type, p_start_date, p_end_date, p_start_half_day, p_end_half_day, p_reason); $function$;

create function public.cancel_leave_request(p_id uuid)
returns public.leave_requests
language sql
set search_path to ''
as $function$ select * from app.cancel_leave_request(p_id); $function$;

create function public.decide_leave_request(p_id uuid, p_approve boolean, p_note text default null)
returns public.leave_requests
language sql
set search_path to ''
as $function$ select * from app.decide_leave_request(p_id, p_approve, p_note); $function$;

create function public.set_leave_balance(p_user_id uuid, p_leave_type public.leave_type, p_year integer, p_quota_days numeric)
returns public.leave_balances
language sql
set search_path to ''
as $function$ select * from app.set_leave_balance(p_user_id, p_leave_type, p_year, p_quota_days); $function$;

revoke execute on function app.request_leave(public.leave_type, date, date, boolean, boolean, text) from public;
revoke execute on function app.cancel_leave_request(uuid) from public;
revoke execute on function app.decide_leave_request(uuid, boolean, text) from public;
revoke execute on function app.set_leave_balance(uuid, public.leave_type, integer, numeric) from public;
revoke execute on function public.request_leave(public.leave_type, date, date, boolean, boolean, text) from public;
revoke execute on function public.cancel_leave_request(uuid) from public;
revoke execute on function public.decide_leave_request(uuid, boolean, text) from public;
revoke execute on function public.set_leave_balance(uuid, public.leave_type, integer, numeric) from public;

grant execute on function app.request_leave(public.leave_type, date, date, boolean, boolean, text) to authenticated;
grant execute on function app.cancel_leave_request(uuid) to authenticated;
grant execute on function app.decide_leave_request(uuid, boolean, text) to authenticated;
grant execute on function app.set_leave_balance(uuid, public.leave_type, integer, numeric) to authenticated;
grant execute on function public.request_leave(public.leave_type, date, date, boolean, boolean, text) to authenticated;
grant execute on function public.cancel_leave_request(uuid) to authenticated;
grant execute on function public.decide_leave_request(uuid, boolean, text) to authenticated;
grant execute on function public.set_leave_balance(uuid, public.leave_type, integer, numeric) to authenticated;
