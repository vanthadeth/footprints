-- Footprints: sales per salesperson from the synced sale orders, and a stored
-- link between each sale order and the visit that earned it.
--
-- Sales volume used to be read off visits (the amount a person typed, or the
-- first order matched to the visit). It is now the sale orders themselves:
--
--   a salesperson's total  = the valid orders ASSIGNED to them (sale_orders.user_id,
--                            set from ASSIGN_TO by the sync) with an order date in the period
--   the team's total       = the same sum over the team's salespeople
--
-- "Created today" is the order date written in the sheet (Phnom Penh day), so a
-- late or repeated sync never moves an order to another day. Orders whose
-- ASSIGN_TO matched nobody have no user_id and are in no person's or team's
-- total. KHR orders carry total_khr only and add nothing to the USD total.
--
-- A visit marked "ordered" still counts as one order for its person; the sync
-- now pairs each sale order with a visit and stores the pair, so the visit shows
-- as confirmed without a lookup at read time:
--
--   visit day <= order date <= visit day + 2     (ORDER_RECONCILE_DAYS, 0113)
--   same customer, visit not cancelled; the order's assigned user's visit wins,
--   then the latest visit. One link per order (a visit can have several orders).
--
-- The link is kept by a trigger on sale_orders (so both sync engines are
-- covered) and re-checked every night for the last 14 days, because a visit
-- can be recorded after its order synced. Additive; nothing existing changes.

-- ---------------------------------------------------------------------------
-- The link
-- ---------------------------------------------------------------------------
create table public.sale_order_visits (
  order_id  uuid primary key references public.sale_orders (id) on delete cascade,
  visit_id  uuid not null references public.visits (id) on delete cascade,
  linked_at timestamptz not null default now()
);
create index sale_order_visits_visit_idx on public.sale_order_visits (visit_id);

alter table public.sale_order_visits enable row level security;
revoke all on public.sale_order_visits from anon, authenticated;

comment on table public.sale_order_visits is 'The visit each valid sale order is paired with (same customer, visit day to 2 days before the order date); kept by app.link_sale_order.';

create function app.link_sale_order(p_order uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.sale_orders;
  v uuid;
begin
  select * into o from public.sale_orders where id = p_order;
  if not found or o.status::text <> 'new' or o.customer_id is null or o.order_date is null then
    delete from public.sale_order_visits where order_id = p_order;
    return;
  end if;

  select vv.id into v
    from public.visits vv
   where vv.customer_id = o.customer_id
     and vv.cancelled_at is null
     and (vv.checked_in_at at time zone 'Asia/Phnom_Penh')::date <= o.order_date
     and (vv.checked_in_at at time zone 'Asia/Phnom_Penh')::date >= o.order_date - 2
   order by (vv.user_id is not distinct from o.user_id) desc, vv.checked_in_at desc
   limit 1;

  if v is null then
    delete from public.sale_order_visits where order_id = p_order;
  else
    insert into public.sale_order_visits (order_id, visit_id) values (p_order, v)
    on conflict (order_id) do update set visit_id = excluded.visit_id, linked_at = now();
  end if;
end;
$$;

create function app.sale_orders_link_trg()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.link_sale_order(new.id);
  return new;
end;
$$;

create trigger sale_orders_link
  after insert or update of customer_id, user_id, order_date, status on public.sale_orders
  for each row execute function app.sale_orders_link_trg();

-- Pair (again) the orders of the last p_days days; returns how many were looked at.
create function app.link_recent_sale_orders(p_days integer default 14)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  n integer := 0;
begin
  for r in
    select id from public.sale_orders
     where order_date >= (now() at time zone 'Asia/Phnom_Penh')::date - greatest(p_days, 0)
  loop
    perform app.link_sale_order(r.id);
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- 00:40 Phnom Penh every day.
select cron.schedule('link-sale-orders', '40 17 * * *', $$select app.link_recent_sale_orders(14);$$);

-- Pair what is already there.
select app.link_recent_sale_orders(60);

-- ---------------------------------------------------------------------------
-- Reading the link (like 0113: only for visits the caller can already see)
-- ---------------------------------------------------------------------------
create function app.sale_orders_linked(p_visit uuid)
returns table (order_no text, order_date date, total_usd numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select o.order_no, o.order_date, o.total_usd
    from public.sale_order_visits l
    join public.sale_orders o on o.id = l.order_id
   where l.visit_id = p_visit
     and o.status::text = 'new'
   order by o.order_date, o.created_at;
$$;

create function public.visit_order_links(p_visit_ids uuid[])
returns table (visit_id uuid, order_no text, order_date date, total_usd numeric)
language sql
stable
set search_path = ''
as $$
  select v.id, o.order_no, o.order_date, o.total_usd
    from public.visits v
   cross join lateral app.sale_orders_linked(v.id) o
   where v.id = any (p_visit_ids)
     and v.cancelled_at is null;
$$;

-- ---------------------------------------------------------------------------
-- Sales per salesperson
-- ---------------------------------------------------------------------------
-- The valid orders assigned to each user with an order date in [p_from, p_to],
-- for the users the caller may see (themselves, or people they have the team
-- map or the sale order view for). sale_orders is not readable by most
-- managers (app.can('sale_order', 'view', user_id)), hence security definer.
create function public.sales_by_user(p_from date, p_to date, p_users uuid[] default null)
returns table (user_id uuid, orders integer, total_usd numeric)
language sql
stable
security definer
set search_path = ''
as $$
  with agg as (
    select o.user_id, count(*)::integer as n, coalesce(sum(o.total_usd), 0) as t
      from public.sale_orders o
     where o.status::text = 'new'
       and o.user_id is not null
       and o.order_date between p_from and p_to
       and (p_users is null or o.user_id = any (p_users))
     group by o.user_id
  )
  select a.user_id, a.n, a.t
    from agg a
   where a.user_id = (select auth.uid())
      or app.can('team_map', 'view', a.user_id)
      or app.can('sale_order', 'view', a.user_id);
$$;

revoke execute on function app.link_sale_order(uuid) from public;
revoke execute on function app.sale_orders_link_trg() from public;
revoke execute on function app.link_recent_sale_orders(integer) from public;
revoke execute on function app.sale_orders_linked(uuid) from public;
revoke execute on function public.visit_order_links(uuid[]) from public;
revoke execute on function public.sales_by_user(date, date, uuid[]) from public;
grant execute on function app.sale_orders_linked(uuid) to authenticated, service_role;
grant execute on function public.visit_order_links(uuid[]) to authenticated;
grant execute on function public.sales_by_user(date, date, uuid[]) to authenticated;
