-- Footprints: reconcile a visit's "ordered" mark with the synced sale orders.
--
-- A visit marked "Ordered" counts as ordered only provisionally. It is
-- confirmed when the sale order sheet sync brings in a valid order (status
-- 'new') for the same customer dated from the visit's day to p_days days after
-- (default 2). Past the end of that window with no order, the mark stops
-- counting. The app does that comparison (src/features/orders/orderReconcile.ts);
-- this function only answers "which order, if any, matches this visit".
--
-- sale_orders is readable only through app.can('sale_order', 'view', user_id),
-- and synced orders have no user_id, so most people can't read them. The match
-- therefore goes through app.sale_order_for (security definer), which hands back
-- one order's number, date and total -- and public.visit_orders only passes it
-- visits the caller can already see (it runs with their rights, so RLS on
-- public.visits applies).

create function app.sale_order_for(p_customer uuid, p_from date, p_to date)
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
   order by o.order_date, o.created_at
   limit 1;
$$;

create function public.visit_orders(p_visit_ids uuid[], p_days integer default 2)
returns table (visit_id uuid, order_no text, order_date date, total_usd numeric)
language sql
stable
set search_path = ''
as $$
  select v.id, o.order_no, o.order_date, o.total_usd
    from public.visits v
   cross join lateral app.sale_order_for(
          v.customer_id,
          (v.checked_in_at at time zone 'Asia/Phnom_Penh')::date,
          (v.checked_in_at at time zone 'Asia/Phnom_Penh')::date + greatest(p_days, 0)
        ) o
   where v.id = any (p_visit_ids)
     and v.cancelled_at is null
     and v.customer_id is not null;
$$;

revoke execute on function app.sale_order_for(uuid, date, date) from public;
revoke execute on function public.visit_orders(uuid[], integer) from public;
grant execute on function app.sale_order_for(uuid, date, date) to authenticated, service_role;
grant execute on function public.visit_orders(uuid[], integer) to authenticated;
