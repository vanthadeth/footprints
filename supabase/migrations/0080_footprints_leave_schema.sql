-- Footprints: Leave Management -- schema.
--
-- New concept alongside attendance: a planned absence (Annual/Sick/Unpaid)
-- that a person requests and their manager (or HR/Super Admin) approves.
-- Follows this schema's existing conventions throughout:
--   * RLS via app.can(module_key, action, owner_user_id) -- see
--     0069_footprints_my_team.sql's app.my_team()/app.can() usage and
--     0073_footprints_manager_alerts.sql's app.chain_managers() for the
--     manager-chain concept this reuses (users.manager_id).
--   * Direct table policies mirror `attendance`'s exact shape (insert/
--     select/update, all keyed on app.can(...)) even though the actual
--     writes below go through security-definer RPCs (0081) that also
--     enforce quota/overlap/no-self-approval rules RLS can't express --
--     same belt-and-suspenders shape `attendance` already has with
--     clock_in/clock_out.
--   * A friendly summary view (leave_balance_summary), security_invoker,
--     same convention as notification_feed.
--
-- Known v1 limitations (acceptable, easy to revisit):
--   * A request's "year" for balance/quota purposes is simply
--     extract(year from start_date) -- a request spanning New Year's Eve
--     into January is bucketed entirely under its start year. Uncommon
--     enough for this app's usage to not special-case.
--   * `unpaid` leave has no quota/balance row at all -- always allowed
--     (subject only to the no-overlap check), matching the product
--     decision that only Annual/Sick are quota-tracked.

create type public.leave_type as enum ('annual', 'sick', 'unpaid');
create type public.leave_status as enum ('pending', 'approved', 'rejected', 'cancelled');

comment on type public.leave_type is 'The three leave categories this app supports. Only annual/sick are quota-tracked (see leave_balances) -- unpaid is uncapped.';
comment on type public.leave_status is 'A leave_requests row''s lifecycle: pending -> approved|rejected (by a manager/HR/Super Admin), or pending -> cancelled (by the requester, before it''s decided).';

create table public.leave_balances (
  user_id     uuid not null references public.users(id) on delete cascade,
  leave_type  public.leave_type not null,
  year        integer not null,
  quota_days  numeric(4,1) not null default 0 check (quota_days >= 0),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.users(id),
  primary key (user_id, leave_type, year)
);

comment on table public.leave_balances is
  'Admin-set annual quota (in days, half-day granularity) per user/leave_type/year. Only annual/sick ever get a row -- no row means a 0 quota (a request will be rejected until an admin sets one). Written only via app.set_leave_balance (0081).';

create table public.leave_requests (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.users(id) on delete cascade,
  leave_type       public.leave_type not null,
  start_date       date not null,
  end_date         date not null,
  start_half_day   boolean not null default false,
  end_half_day     boolean not null default false,
  reason           text,
  status           public.leave_status not null default 'pending',
  decided_by       uuid references public.users(id),
  decided_at       timestamptz,
  decision_note    text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint leave_requests_date_range check (end_date >= start_date)
);

comment on table public.leave_requests is
  'One leave request, full-day or half-day at either end (start_half_day/end_half_day -- see app.leave_request_days for the day-count formula). Written only via app.request_leave/cancel_leave_request/decide_leave_request (0081), which enforce quota, overlap, and no-self-approval rules beyond what RLS alone can express.';

create index leave_requests_user_id_idx on public.leave_requests (user_id);
create index leave_requests_status_idx on public.leave_requests (status) where status = 'pending';
create index leave_requests_date_range_idx on public.leave_requests (user_id, start_date, end_date);

alter table public.leave_balances enable row level security;
alter table public.leave_requests enable row level security;

-- leave_balances: read-scoped like everything else; writes only via the
-- app.set_leave_balance RPC (0081), gated on the 'edit' action same as
-- these two policies so a direct write and the RPC agree on who's allowed.
create policy leave_balances_select on public.leave_balances
  for select using (app.can('leave_balance', 'view', user_id));
create policy leave_balances_insert on public.leave_balances
  for insert with check (app.can('leave_balance', 'edit', user_id));
create policy leave_balances_update on public.leave_balances
  for update using (app.can('leave_balance', 'edit', user_id)) with check (app.can('leave_balance', 'edit', user_id));

-- leave_requests: same three-policy shape as `attendance`. The 'edit'
-- policy covers both a requester editing their own still-pending request
-- and a manager/HR/Super Admin approving or rejecting someone else's --
-- the RPCs (0081) are what actually distinguish those two cases (a
-- decide_leave_request call explicitly forbids deciding your own request).
create policy leave_requests_insert on public.leave_requests
  for insert with check (app.can('leave', 'add', user_id));
create policy leave_requests_select on public.leave_requests
  for select using (app.can('leave', 'view', user_id));
create policy leave_requests_update on public.leave_requests
  for update using (app.can('leave', 'edit', user_id)) with check (app.can('leave', 'edit', user_id));

-- Pure day-count math, shared by leave_balance_summary (below) and
-- app.request_leave (0081) so the two never disagree. Plain sql/immutable,
-- no RLS/security concerns -- it only ever operates on values the caller
-- already passed in, never reads a table.
create function app.leave_request_days(p_start_date date, p_end_date date, p_start_half_day boolean, p_end_half_day boolean)
returns numeric
language sql
immutable
set search_path to ''
as $function$
  select (p_end_date - p_start_date + 1)
       - (case when p_start_half_day then 0.5 else 0 end)
       - (case when p_end_half_day then 0.5 else 0 end);
$function$;

comment on function app.leave_request_days is
  'Day count for a leave request: whole days in [start_date, end_date], minus 0.5 for a half-day start and/or end.';

-- Friendly read model: quota + how many days are already spoken for
-- (pending or approved) this year, for the caller's own balance card and
-- a manager/HR's team view. security_invoker so it's scoped by the base
-- tables' own RLS above, same convention as notification_feed.
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
    select sum(app.leave_request_days(r.start_date, r.end_date, r.start_half_day, r.end_half_day)) as days
    from public.leave_requests r
    where r.user_id = b.user_id
      and r.leave_type = b.leave_type
      and r.status in ('pending', 'approved')
      and extract(year from r.start_date)::integer = b.year
  ) used on true;

comment on view public.leave_balance_summary is
  'quota_days minus days already pending/approved this year, per user/leave_type/year. Relies on app.leave_request_days (0081) for the day-count math.';
