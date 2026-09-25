-- Footprints: customer tiers (A/B/C visit cadence) + coverage.
--
-- A tier sets how often a customer should be visited: A every 7 days,
-- B every 14 (also the default when a customer has no tier row), C every 30.
--
-- customers.last_visit_date has never been populated, so "last visit" is
-- computed from public.visits. That has to count ANY rep's visit (if a
-- colleague was there yesterday the shop isn't overdue), while a Sales Team
-- member can only see their own visits under RLS -- so app.customer_coverage
-- is security definer, applies the customer view rule itself via app.can(),
-- and only returns the aggregate last-visit time, never visit details.
--
-- Sales Team can view all ~2,000 customers, so the RPC takes a scope:
--   'mine'   -- customers I own or have visited myself
--   'nearby' -- any viewable customer with a pin, nearest first (needs p_lat/p_lng)
--   'all'    -- everything, alphabetical (use with p_search)
-- plus p_limit (PostgREST caps responses at 1000 rows anyway).

create table public.customer_tiers (
  customer_id uuid primary key references public.customers(id) on delete cascade,
  tier        text not null check (tier in ('A', 'B', 'C')),
  updated_by  uuid references public.users(id) default auth.uid(),
  updated_at  timestamptz not null default now()
);

comment on table public.customer_tiers is
  'Visit-cadence tier per customer: A = weekly, B = fortnightly (default when no row), C = monthly. Written via app.set_customer_tier.';

create index customer_tiers_updated_by_idx on public.customer_tiers (updated_by);

alter table public.customer_tiers enable row level security;

create policy customer_tiers_select on public.customer_tiers
  for select to authenticated
  using (exists (
    select 1 from public.customers c
     where c.id = customer_tiers.customer_id
       and app.can('customer', 'view', c.owner_id)
  ));

create policy customer_tiers_insert on public.customer_tiers
  for insert to authenticated
  with check (exists (
    select 1 from public.customers c
     where c.id = customer_tiers.customer_id
       and app.can('customer', 'edit', c.owner_id)
  ));

create policy customer_tiers_update on public.customer_tiers
  for update to authenticated
  using (exists (
    select 1 from public.customers c
     where c.id = customer_tiers.customer_id
       and app.can('customer', 'edit', c.owner_id)
  ))
  with check (exists (
    select 1 from public.customers c
     where c.id = customer_tiers.customer_id
       and app.can('customer', 'edit', c.owner_id)
  ));

create policy customer_tiers_delete on public.customer_tiers
  for delete to authenticated
  using (exists (
    select 1 from public.customers c
     where c.id = customer_tiers.customer_id
       and app.can('customer', 'edit', c.owner_id)
  ));

grant select, insert, update, delete on public.customer_tiers to authenticated;

create function app.tier_cadence_days(p_tier text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_tier when 'A' then 7 when 'C' then 30 else 14 end;
$$;

-- Security invoker: the customer_tiers RLS above decides who may write.
-- A null tier removes the row (back to the default B).
create function app.set_customer_tier(p_customer uuid, p_tier text)
returns public.customer_tiers
language plpgsql
set search_path = ''
as $$
declare
  v_row public.customer_tiers;
begin
  if p_tier is null then
    delete from public.customer_tiers where customer_id = p_customer;
    return null;
  end if;

  insert into public.customer_tiers (customer_id, tier, updated_by, updated_at)
  values (p_customer, p_tier, auth.uid(), now())
  on conflict (customer_id) do update
     set tier = excluded.tier, updated_by = excluded.updated_by, updated_at = excluded.updated_at
  returning * into v_row;

  return v_row;
end;
$$;

create function public.set_customer_tier(p_customer uuid, p_tier text)
returns public.customer_tiers
language sql
set search_path = ''
as $$
  select app.set_customer_tier(p_customer, p_tier);
$$;

create function app.customer_coverage(
  p_scope text default 'mine',
  p_lat numeric default null,
  p_lng numeric default null,
  p_search text default null,
  p_limit integer default 300
)
returns table (
  customer_id   uuid,
  shop_name     text,
  code          text,
  address       text,
  latitude      numeric,
  longitude     numeric,
  tier          text,
  cadence_days  integer,
  last_visit_at timestamptz,
  days_since    integer,
  due_state     text,
  distance_m    integer,
  visited_by_me boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select auth.uid() as uid, (now() at time zone 'Asia/Phnom_Penh')::date as today
  ),
  last_visit as (
    select v.customer_id,
           max(v.checked_in_at) as last_at,
           bool_or(v.user_id = (select uid from me)) as mine
      from public.visits v
     where v.cancelled_at is null and v.customer_id is not null
     group by v.customer_id
  ),
  base as (
    select c.id,
           c.shop_name,
           c.code,
           nullif(concat_ws(', ', nullif(c.street_address, ''), nullif(c.commune_text, ''), nullif(c.district_text, ''), nullif(c.province_text, '')), '') as address,
           c.latitude,
           c.longitude,
           c.owner_id,
           coalesce(t.tier, 'B') as tier,
           app.tier_cadence_days(coalesce(t.tier, 'B')) as cadence,
           lv.last_at,
           coalesce(lv.mine, false) as mine
      from public.customers c
      left join public.customer_tiers t on t.customer_id = c.id
      left join last_visit lv on lv.customer_id = c.id
     where app.can('customer', 'view', c.owner_id)
       and (
         coalesce(btrim(p_search), '') = ''
         or c.shop_name ilike '%' || btrim(p_search) || '%'
         or c.code ilike '%' || btrim(p_search) || '%'
       )
  ),
  scored as (
    select b.*,
           ((select today from me) - (b.last_at at time zone 'Asia/Phnom_Penh')::date) as days,
           case
             when p_lat is not null and p_lng is not null and b.latitude is not null and b.longitude is not null
               then round(app.metres_between(p_lat, p_lng, b.latitude, b.longitude))::integer
           end as dist
      from base b
  ),
  stated as (
    select s.*,
           case
             when s.last_at is null then 'never'
             when s.days > s.cadence then 'overdue'
             when s.days >= s.cadence - 2 then 'due'
             else 'ok'
           end as state
      from scored s
  )
  select st.id, st.shop_name, st.code, st.address, st.latitude, st.longitude,
         st.tier, st.cadence, st.last_at, st.days, st.state, st.dist, st.mine
    from stated st
   where case coalesce(p_scope, 'mine')
           when 'mine' then st.mine or st.owner_id = (select uid from me)
           when 'nearby' then st.dist is not null
           else true
         end
   order by
     case when p_scope = 'nearby' then st.dist end nulls last,
     case when p_scope = 'all' then st.shop_name end,
     case st.state when 'overdue' then 0 when 'due' then 1 when 'never' then 2 else 3 end,
     st.dist nulls last,
     st.days desc nulls last
   limit least(greatest(coalesce(p_limit, 300), 1), 1000);
$$;

create function public.customer_coverage(
  p_scope text default 'mine',
  p_lat numeric default null,
  p_lng numeric default null,
  p_search text default null,
  p_limit integer default 300
)
returns table (
  customer_id   uuid,
  shop_name     text,
  code          text,
  address       text,
  latitude      numeric,
  longitude     numeric,
  tier          text,
  cadence_days  integer,
  last_visit_at timestamptz,
  days_since    integer,
  due_state     text,
  distance_m    integer,
  visited_by_me boolean
)
language sql
stable
set search_path = ''
as $$
  select * from app.customer_coverage(p_scope, p_lat, p_lng, p_search, p_limit);
$$;

revoke execute on function app.tier_cadence_days(text) from public;
revoke execute on function app.set_customer_tier(uuid, text) from public;
revoke execute on function public.set_customer_tier(uuid, text) from public;
revoke execute on function app.customer_coverage(text, numeric, numeric, text, integer) from public;
revoke execute on function public.customer_coverage(text, numeric, numeric, text, integer) from public;

grant execute on function app.tier_cadence_days(text) to authenticated;
grant execute on function app.set_customer_tier(uuid, text) to authenticated;
grant execute on function public.set_customer_tier(uuid, text) to authenticated;
grant execute on function app.customer_coverage(text, numeric, numeric, text, integer) to authenticated;
grant execute on function public.customer_coverage(text, numeric, numeric, text, integer) to authenticated;
