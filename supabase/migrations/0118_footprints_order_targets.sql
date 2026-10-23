-- Footprints: the daily order target behind the effectiveness score's orders part.
--
-- The orders part of the score is now the value of the day's orders against a daily
-- target (it was orders / visits, which rewarded visiting less and ignored big orders).
-- The target is per person (users.daily_order_target_usd); someone without one uses
-- the company default (app_settings.daily_order_target_usd). Like the visit target it
-- is for a full working day and the app scales it by the day's scheduled hours.

alter table public.users
  add column daily_order_target_usd numeric check (daily_order_target_usd is null or daily_order_target_usd >= 0);

alter table public.app_settings
  add column daily_order_target_usd numeric not null default 300 check (daily_order_target_usd >= 0);

comment on column public.users.daily_order_target_usd is 'This person''s daily order target in USD for a full working day; null uses app_settings.daily_order_target_usd.';
comment on column public.app_settings.daily_order_target_usd is 'Daily order target in USD for a full working day, for people without their own users.daily_order_target_usd.';

-- Each person's own target for everyone the caller can see (the same set as my_team),
-- so team screens can score people without reading other people's user rows.
create function public.team_order_targets()
returns table (user_id uuid, daily_order_target_usd numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id, u.daily_order_target_usd
    from public.users u
   where u.status = 'active'
     and app.can('attendance', 'view', u.id);
$$;

revoke execute on function public.team_order_targets() from public, anon;
grant execute on function public.team_order_targets() to authenticated, service_role;
