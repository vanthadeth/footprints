-- Footprints: count sale orders that are not approved yet (pending approval).
--
-- 0107 treated an order as valid only when ORDER_STATUS = 1 AND APPROVED = TRUE,
-- so an order waiting for approval was never imported (or was cancelled in the
-- app), while the sheet's own total counts every ORDER_STATUS = 1 row. On
-- 2 Nov 2026 that was $1,233.77 on the sheet against $800.68 in the app: the
-- $433.09 gap is three orders with APPROVED = FALSE.
--
-- Now an order is valid when ORDER_STATUS = 1, approved or not. It imports as
-- status 'new' with approved = false (the orders list already labels it "Not
-- approved"); statuses 0 and 9 stay cancelled. Orders already in the app as
-- 'cancelled' only because approval was withdrawn flip back to 'new' on the
-- next sync. sales_by_user (0125) now also returns what part of the total is
-- still pending approval, and leaves $0 orders out of the order count.

create or replace function app.sheet_orders_apply(p_run uuid, p_rows jsonb, p_dry boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_counts  jsonb;
  v_skipped jsonb;
  v_valid   integer;
  v_matched integer;
  v_upd     integer;
  v_new     integer;
  v_cancel  integer;
begin
  perform 1 from public.sheet_sync_runs r where r.id = p_run;
  if not found then
    raise exception 'not_found' using detail = 'That sync run doesn’t exist.';
  end if;

  begin
    -- Each batch is its own transaction (one RPC call), so the table is new every time and goes at commit.
    create temp table pg_temp.sheet_order_rows (
      sheet_id text primary key, order_no text, customer_sheet_id text, user_id uuid, assign_to text,
      order_date date, delivery_date date, is_khr boolean, note text, delivery_request text, truck_id text,
      cartons numeric, order_status integer, approved boolean, stock_checked boolean, approved_by text,
      approved_at timestamptz, created_by text, created_at timestamptz, modified_by text, modified_at timestamptz,
      payment_term text, so_type text, latitude numeric, longitude numeric, distance numeric, value numeric,
      valid boolean, order_id uuid, customer_id uuid, reason text
    ) on commit drop;

    insert into pg_temp.sheet_order_rows
    select distinct on (btrim(s.sheet_id))
           btrim(s.sheet_id), nullif(btrim(s.order_no), ''), nullif(btrim(s.customer_sheet_id), ''), s.user_id,
           nullif(btrim(s.assign_to), ''), s.order_date, s.delivery_date, coalesce(s.is_khr, false), nullif(btrim(s.note), ''),
           nullif(btrim(s.delivery_request), ''), nullif(btrim(s.truck_id), ''), s.cartons, s.order_status,
           coalesce(s.approved, false), coalesce(s.stock_checked, false), nullif(btrim(s.approved_by), ''), s.approved_at,
           nullif(btrim(s.created_by), ''), s.created_at, nullif(btrim(s.modified_by), ''), s.modified_at,
           nullif(btrim(s.payment_term), ''), nullif(btrim(s.so_type), ''), s.latitude, s.longitude, s.distance,
           round(s.value, 2),
           s.order_status = 1,
           o.id, c.id, null
      from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as s(
             sheet_id text, order_no text, customer_sheet_id text, user_id uuid, assign_to text,
             order_date date, delivery_date date, is_khr boolean, note text, delivery_request text, truck_id text,
             cartons numeric, order_status integer, approved boolean, stock_checked boolean, approved_by text,
             approved_at timestamptz, created_by text, created_at timestamptz, modified_by text, modified_at timestamptz,
             payment_term text, so_type text, latitude numeric, longitude numeric, distance numeric, value numeric)
      left join public.sale_orders o on o.sheet_id = btrim(s.sheet_id)
      left join public.customers c on c.sheet_id = btrim(s.customer_sheet_id)
     where coalesce(btrim(s.sheet_id), '') <> ''
     order by btrim(s.sheet_id);

    -- Valid orders that can't be written: no order number, an unknown customer, or a number another order has.
    update pg_temp.sheet_order_rows t
       set reason = case
             when t.order_no is null then 'Order has no ORDER_NUMBER'
             when t.customer_id is null and t.order_id is null then 'Customer ' || coalesce(t.customer_sheet_id, '(none)') || ' isn’t in the app'
             when exists (select 1 from public.sale_orders o where o.order_no = t.order_no and o.id is distinct from t.order_id)
               then 'Order number ' || t.order_no || ' is already used by another order'
             when exists (select 1 from pg_temp.sheet_order_rows d where d.order_no = t.order_no and d.valid and d.sheet_id < t.sheet_id)
               then 'Order number ' || t.order_no || ' appears twice in the sheet'
           end
     where t.valid;

    select count(*) filter (where t.valid),
           count(*) filter (where t.order_id is not null and (not t.valid or t.reason is null)),
           coalesce(jsonb_agg(jsonb_build_object('key', coalesce(t.order_no, t.sheet_id), 'reason', t.reason)) filter (where t.reason is not null), '[]'::jsonb)
      into v_valid, v_matched, v_skipped
      from pg_temp.sheet_order_rows t;

    -- Orders already in the app: mirror the sheet; no longer valid -> cancelled (the customer link stays).
    with n as (
      select o.id,
             case when t.valid and t.reason is null then t.order_no else o.order_no end as order_no,
             coalesce(t.customer_id, o.customer_id) as customer_id,
             coalesce(t.user_id, o.user_id) as user_id,
             (case when t.valid then 'new' else 'cancelled' end)::public.sale_order_status as status,
             o.status as old_status,
             case when not t.is_khr then t.value end as total_usd,
             case when t.is_khr then t.value end as total_khr,
             t.note, t.customer_sheet_id, t.assign_to, t.order_date, t.delivery_date, t.is_khr, t.delivery_request,
             t.truck_id, t.cartons, t.order_status as sheet_status, t.approved, t.stock_checked, t.approved_by,
             t.approved_at, t.created_by as sheet_created_by, t.created_at as sheet_created_at,
             t.modified_by as sheet_modified_by, t.modified_at as sheet_modified_at, t.payment_term, t.so_type,
             t.latitude, t.longitude, t.distance
        from pg_temp.sheet_order_rows t
        join public.sale_orders o on o.id = t.order_id
       where not t.valid or t.reason is null
    ), upd as (
      update public.sale_orders o
         set order_no = n.order_no, customer_id = n.customer_id, user_id = n.user_id, status = n.status,
             total_usd = n.total_usd, total_khr = n.total_khr, note = n.note, customer_sheet_id = n.customer_sheet_id,
             assign_to = n.assign_to, order_date = n.order_date, delivery_date = n.delivery_date, is_khr = n.is_khr,
             delivery_request = n.delivery_request, truck_id = n.truck_id, cartons = n.cartons,
             sheet_status = n.sheet_status, approved = n.approved, stock_checked = n.stock_checked,
             approved_by = n.approved_by, approved_at = n.approved_at, sheet_created_by = n.sheet_created_by,
             sheet_created_at = n.sheet_created_at, sheet_modified_by = n.sheet_modified_by,
             sheet_modified_at = n.sheet_modified_at, payment_term = n.payment_term, so_type = n.so_type,
             latitude = n.latitude, longitude = n.longitude, distance = n.distance, synced_at = now()
        from n
       where o.id = n.id
         and (n.order_no, n.customer_id, n.user_id, n.status, n.total_usd, n.total_khr, n.note, n.customer_sheet_id,
              n.assign_to, n.order_date, n.delivery_date, n.is_khr, n.delivery_request, n.truck_id, n.cartons,
              n.sheet_status, n.approved, n.stock_checked, n.approved_by, n.approved_at, n.sheet_created_by,
              n.sheet_created_at, n.sheet_modified_by, n.sheet_modified_at, n.payment_term, n.so_type,
              n.latitude, n.longitude, n.distance)
             is distinct from
             (o.order_no, o.customer_id, o.user_id, o.status, o.total_usd, o.total_khr, o.note, o.customer_sheet_id,
              o.assign_to, o.order_date, o.delivery_date, o.is_khr, o.delivery_request, o.truck_id, o.cartons,
              o.sheet_status, o.approved, o.stock_checked, o.approved_by, o.approved_at, o.sheet_created_by,
              o.sheet_created_at, o.sheet_modified_by, o.sheet_modified_at, o.payment_term, o.so_type,
              o.latitude, o.longitude, o.distance)
      returning n.status = 'cancelled' and n.old_status <> 'cancelled' as just_cancelled
    )
    select count(*), count(*) filter (where upd.just_cancelled) into v_upd, v_cancel from upd;

    -- New valid orders.
    with ins as (
      insert into public.sale_orders (order_no, customer_id, user_id, status, total_usd, total_khr, note, sheet_id,
                                      customer_sheet_id, assign_to, order_date, delivery_date, is_khr, delivery_request,
                                      truck_id, cartons, sheet_status, approved, stock_checked, approved_by, approved_at,
                                      sheet_created_by, sheet_created_at, sheet_modified_by, sheet_modified_at,
                                      payment_term, so_type, latitude, longitude, distance, synced_at, created_at)
      select t.order_no, t.customer_id, t.user_id, 'new', case when not t.is_khr then t.value end, case when t.is_khr then t.value end,
             t.note, t.sheet_id, t.customer_sheet_id, t.assign_to, t.order_date, t.delivery_date, t.is_khr, t.delivery_request,
             t.truck_id, t.cartons, t.order_status, t.approved, t.stock_checked, t.approved_by, t.approved_at,
             t.created_by, t.created_at, t.modified_by, t.modified_at, t.payment_term, t.so_type, t.latitude, t.longitude,
             t.distance, now(), coalesce(t.created_at, now())
        from pg_temp.sheet_order_rows t
       where t.valid and t.reason is null and t.order_id is null
      returning id
    )
    select count(*) into v_new from ins;

    v_counts := jsonb_build_object(
      'valid', v_valid,
      'created', v_new,
      'updated', v_upd - v_cancel,
      'cancelled', v_cancel,
      'unchanged', greatest(v_matched - v_upd, 0),
      'skipped', jsonb_array_length(v_skipped),
      'skipped_rows', (select coalesce(jsonb_agg(e), '[]'::jsonb) from (select e from jsonb_array_elements(v_skipped) e limit 50) s));

    if p_dry then
      raise exception 'sheet_sync_dry_run';
    end if;
  exception when raise_exception then
    if sqlerrm <> 'sheet_sync_dry_run' then
      raise;
    end if;
  end;

  return v_counts;
end;
$function$;

-- Same result as 0125 plus the pending part: orders and USD still not approved.
drop function public.sales_by_user(date, date, uuid[]);

create function public.sales_by_user(p_from date, p_to date, p_users uuid[] default null)
returns table (user_id uuid, orders integer, total_usd numeric, pending_orders integer, pending_usd numeric)
language sql
stable
security definer
set search_path = ''
as $$
  with agg as (
    select o.user_id,
           count(*)::integer as n,
           coalesce(sum(o.total_usd), 0) as t,
           (count(*) filter (where not o.approved))::integer as pn,
           coalesce(sum(o.total_usd) filter (where not o.approved), 0) as pt
      from public.sale_orders o
     where o.status::text = 'new'
       and o.user_id is not null
       and o.total_usd is distinct from 0
       and o.order_date between p_from and p_to
       and (p_users is null or o.user_id = any (p_users))
     group by o.user_id
  )
  select a.user_id, a.n, a.t, a.pn, a.pt
    from agg a
   where a.user_id = (select auth.uid())
      or app.can('team_map', 'view', a.user_id)
      or app.can('sale_order', 'view', a.user_id);
$$;

revoke execute on function public.sales_by_user(date, date, uuid[]) from public;
grant execute on function public.sales_by_user(date, date, uuid[]) to authenticated;
