-- Footprints: the sales target is monthly, and a person can be switched off it.
--
-- Until now the target was daily (users.daily_order_target_usd, with the company default
-- app_settings.daily_order_target_usd). It is now a monthly target; the app works out each
-- day's share (the monthly target divided by the person's working days in the month, scaled by
-- the day's hours) for the effectiveness score.
--
-- Some people do not have to achieve a sales target (office staff, for example):
-- users.sales_target_required switches it off for them. Without a target their score has no
-- orders part and they add nothing to the team's sales target.
--
-- The new monthly targets start empty: the company default is 0 (no target) until an admin
-- sets one, and nobody has their own. The old daily columns are left in place, no longer
-- read; they can be dropped in a later migration.

alter table public.users
  add column monthly_order_target_usd numeric check (monthly_order_target_usd is null or monthly_order_target_usd >= 0),
  add column sales_target_required boolean not null default true;

alter table public.app_settings
  add column monthly_order_target_usd numeric not null default 0 check (monthly_order_target_usd >= 0);

comment on column public.users.monthly_order_target_usd is 'This person''s monthly sales target in USD; null uses app_settings.monthly_order_target_usd.';
comment on column public.users.sales_target_required is 'False: this person does not have to achieve a sales target (no orders part in their score, left out of the team target).';
comment on column public.app_settings.monthly_order_target_usd is 'Monthly sales target in USD for people without their own users.monthly_order_target_usd; 0 means no target.';
comment on column public.users.daily_order_target_usd is 'No longer used: replaced by monthly_order_target_usd (0121).';
comment on column public.app_settings.daily_order_target_usd is 'No longer used: replaced by monthly_order_target_usd (0121).';

-- Each person's target and whether they have to achieve it, for everyone the caller can see
-- (the same set as my_team). The return type changes, so the function is replaced.
drop function if exists public.team_order_targets();

create function public.team_order_targets()
returns table (user_id uuid, monthly_order_target_usd numeric, sales_target_required boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id, u.monthly_order_target_usd, u.sales_target_required
    from public.users u
   where u.status = 'active'
     and app.can('attendance', 'view', u.id);
$$;

revoke execute on function public.team_order_targets() from public, anon;
grant execute on function public.team_order_targets() to authenticated, service_role;
