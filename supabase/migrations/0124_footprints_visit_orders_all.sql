-- Footprints: every synced sale order in a visit's window, not just the first.
--
-- 0113's app.sale_order_for hands back ONE order (limit 1) for a customer and
-- date window, enough to confirm that a visit was followed by an order. The
-- team's sales volume has to total every transaction, so this adds the same
-- lookup without the limit:
--
--   app.sale_orders_for(customer, from, to)   all valid ('new') orders in the window
--   public.visit_orders_all(visit_ids, days)  for each visit the caller can see,
--                                             every order in [visit day, visit day + days]
--
-- Same access pattern as 0113: sale_orders is readable only through
-- app.can('sale_order', 'view', user_id) and synced orders have no user_id, so
-- the match goes through a security definer function that is only given visits
-- the caller can already see (public.visit_orders_all runs with their rights,
-- so RLS on public.visits applies). The app counts each order number once, so
-- an order reachable from several visits is not totalled twice.
--
-- Additive: nothing existing changes; the app falls back to visit_orders when
-- this function is not there yet.

create function app.sale_orders_for(p_customer uuid, p_from date, p_to date)
returns table (order_no text, order_date date, total_usd numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select o.order_no, o.order_date, o.total_usd
    from public.sale_orders o
   where o.customer_id = p_customer
     and o.status::text = 'new'
     and o.order_date between p_from and p_to
   order by o.order_date, o.created_at;
$$;

create function public.visit_orders_all(p_visit_ids uuid[], p_days integer default 2)
returns table (visit_id uuid, order_no text, order_date date, total_usd numeric)
language sql
stable
set search_path = ''
as $$
  select v.id, o.order_no, o.order_date, o.total_usd
    from public.visits v
   cross join lateral app.sale_orders_for(
          v.customer_id,
          (v.checked_in_at at time zone 'Asia/Phnom_Penh')::date,
          (v.checked_in_at at time zone 'Asia/Phnom_Penh')::date + greatest(p_days, 0)
        ) o
   where v.id = any (p_visit_ids)
     and v.cancelled_at is null
     and v.customer_id is not null;
$$;

revoke execute on function app.sale_orders_for(uuid, date, date) from public;
revoke execute on function public.visit_orders_all(uuid[], integer) from public;
grant execute on function app.sale_orders_for(uuid, date, date) to authenticated, service_role;
grant execute on function public.visit_orders_all(uuid[], integer) to authenticated;
