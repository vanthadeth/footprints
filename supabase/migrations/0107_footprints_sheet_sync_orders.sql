-- Footprints: Google Sheet sync -- sale orders (one way, sheet -> app).
--
-- The Super Admin adds the sale order sheet (tab SO) to the Google Sheet sync
-- from 0105/0106. Each sync reads it after the customer tabs and mirrors it
-- into public.sale_orders, keyed by the sheet's ID column (sale_orders.sheet_id):
--   * a valid order is ORDER_STATUS = 1 and APPROVED = TRUE. Valid orders are
--     created or updated (status 'new'); an order already in the app that is
--     no longer valid becomes 'cancelled'; invalid orders that were never
--     valid are not imported;
--   * the sheet is the source of truth: every mirrored column takes the
--     sheet's value (an empty cell clears it), except the salesperson, which
--     keeps its last match when ASSIGN_TO names nobody in the app;
--   * the customer is CUSTOMER_ID = customers.sheet_id. An order whose
--     customer isn't in the app is skipped (and reported), as is one whose
--     ORDER_NUMBER another order already has;
--   * orders deleted from the sheet are left alone; nothing is deleted.
-- sale_orders had no rows and no app screens before this; its RLS
-- (app.can('sale_order', ..., user_id)) applies to synced orders as is.

-- ---------------------------------------------------------------- sale_orders

alter table public.sale_orders
  add column sheet_id           text,
  add column customer_sheet_id  text,
  add column assign_to          text,
  add column order_date         date,
  add column delivery_date      date,
  add column is_khr             boolean not null default false,
  add column delivery_request   text,
  add column truck_id           text,
  add column cartons            numeric,
  add column sheet_status       integer,
  add column approved           boolean not null default false,
  add column stock_checked      boolean not null default false,
  add column approved_by        text,
  add column approved_at        timestamptz,
  add column sheet_created_by   text,
  add column sheet_created_at   timestamptz,
  add column sheet_modified_by  text,
  add column sheet_modified_at  timestamptz,
  add column payment_term       text,
  add column so_type            text,
  add column latitude           numeric,
  add column longitude          numeric,
  add column distance           numeric,
  add column synced_at          timestamptz;

create unique index sale_orders_sheet_id_key on public.sale_orders (sheet_id) where sheet_id is not null;
create index sale_orders_user_id_order_date_idx on public.sale_orders (user_id, order_date desc);

comment on column public.sale_orders.sheet_id is 'The order''s ID in the sale order sheet (tab SO); set only on orders synced from it.';
comment on column public.sale_orders.sheet_status is 'ORDER_STATUS from the sheet; with approved, 1 + true is a valid order (status new), anything else cancelled.';

-- ---------------------------------------------------------------- settings / runs

alter table public.sheet_sync_settings add column orders jsonb;
comment on column public.sheet_sync_settings.orders is 'The sale order tab {url, tab}, synced after the customer tabs; null when off.';

alter table public.sheet_sync_runs add column orders jsonb not null default '{}'::jsonb;
comment on column public.sheet_sync_runs.orders is 'Sale order counts: {read, valid, created, updated, unchanged, cancelled, skipped}.';

-- Save (or clear, with null) the sale order tab (Super Admin).
create function app.save_sheet_sync_orders(p_orders jsonb)
returns public.sheet_sync_settings
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_row public.sheet_sync_settings;
begin
  if not app.is_super_admin() then
    raise exception 'insufficient_privilege' using errcode = 'insufficient_privilege', detail = 'Only a Super Admin can set up the Google Sheet sync.';
  end if;
  if p_orders is not null and jsonb_typeof(p_orders) = 'null' then
    p_orders := null;
  end if;
  if p_orders is not null then
    if jsonb_typeof(p_orders) <> 'object' or coalesce(p_orders ->> 'url', '') !~ '^https://docs\.google\.com/spreadsheets/d/[A-Za-z0-9_-]+' then
      raise exception 'invalid_input' using detail = 'The sale order sheet needs a Google Sheets link (docs.google.com/spreadsheets/d/…).';
    end if;
    p_orders := jsonb_build_object('url', btrim(p_orders ->> 'url'), 'tab', nullif(btrim(coalesce(p_orders ->> 'tab', '')), ''));
  end if;
  if p_orders is null and exists (select 1 from public.sheet_sync_settings s where s.id and s.schedule <> 'off' and jsonb_array_length(s.tabs) = 0) then
    raise exception 'invalid_input' using detail = 'Add a sheet tab before turning off the order sync, or turn off the schedule.';
  end if;

  update public.sheet_sync_settings
     set orders = p_orders,
         next_run_at = coalesce(next_run_at, app.sheet_sync_next(now(), schedule, at_time, weekday)),
         updated_by = auth.uid(), updated_at = now()
   where id
  returning * into v_row;
  return v_row;
end;
$function$;

-- A schedule needs a customer tab or the order tab (save_sheet_sync checks tabs only).
create or replace function app.sheet_sync_due()
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists (
           select 1 from public.sheet_sync_settings s
            where s.schedule <> 'off' and s.next_run_at <= now() and (jsonb_array_length(s.tabs) > 0 or s.orders is not null))
     and not exists (
           select 1 from public.sheet_sync_runs r
            where r.status = 'running' and r.trigger <> 'preview' and r.started_at > now() - interval '15 minutes');
$function$;

-- Start a run; a scheduled run moves next_run_at forward at once so the next tick can't start it again.
create or replace function app.sheet_sync_begin(p_trigger text, p_user uuid default null)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_set public.sheet_sync_settings;
  v_id  uuid;
begin
  if p_trigger not in ('manual', 'schedule', 'preview') then
    raise exception 'invalid_input' using detail = 'Unknown sync trigger.';
  end if;
  if p_trigger <> 'preview' and exists (
    select 1 from public.sheet_sync_runs r
     where r.status = 'running' and r.trigger <> 'preview' and r.started_at > now() - interval '15 minutes'
  ) then
    raise exception 'sync_running' using detail = 'A sync is already running. Try again in a few minutes.';
  end if;

  select * into v_set from public.sheet_sync_settings where id for update;
  if jsonb_array_length(v_set.tabs) = 0 and v_set.orders is null then
    raise exception 'invalid_input' using detail = 'Add a sheet tab and save before syncing.';
  end if;
  if p_trigger = 'schedule' then
    update public.sheet_sync_settings
       set next_run_at = app.sheet_sync_next(now(), schedule, at_time, weekday)
     where id;
  end if;

  insert into public.sheet_sync_runs (trigger, started_by) values (p_trigger, p_user) returning id into v_id;
  return jsonb_build_object('run_id', v_id, 'tabs', v_set.tabs, 'orders', v_set.orders, 'date_order', v_set.date_order);
end;
$function$;

-- ---------------------------------------------------------------- apply

-- Apply one batch of sale order rows. p_rows: [{sheet_id, order_no,
-- customer_sheet_id, user_id, assign_to, order_date, delivery_date, is_khr,
-- note, delivery_request, truck_id, cartons, order_status, approved,
-- stock_checked, approved_by, approved_at, created_by, created_at,
-- modified_by, modified_at, payment_term, so_type, latitude, longitude,
-- distance, value}] -- sheet_ids unique, values already parsed (user_id is
-- the matched salesperson or null). p_dry: count, then roll back.
create function app.sheet_orders_apply(p_run uuid, p_rows jsonb, p_dry boolean default false)
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
    create temp table if not exists pg_temp.sheet_order_rows (
      sheet_id text primary key, order_no text, customer_sheet_id text, user_id uuid, assign_to text,
      order_date date, delivery_date date, is_khr boolean, note text, delivery_request text, truck_id text,
      cartons numeric, order_status integer, approved boolean, stock_checked boolean, approved_by text,
      approved_at timestamptz, created_by text, created_at timestamptz, modified_by text, modified_at timestamptz,
      payment_term text, so_type text, latitude numeric, longitude numeric, distance numeric, value numeric,
      valid boolean, order_id uuid, customer_id uuid, reason text
    ) on commit drop;
    truncate pg_temp.sheet_order_rows;

    insert into pg_temp.sheet_order_rows
    select distinct on (btrim(s.sheet_id))
           btrim(s.sheet_id), nullif(btrim(s.order_no), ''), nullif(btrim(s.customer_sheet_id), ''), s.user_id,
           nullif(btrim(s.assign_to), ''), s.order_date, s.delivery_date, coalesce(s.is_khr, false), nullif(btrim(s.note), ''),
           nullif(btrim(s.delivery_request), ''), nullif(btrim(s.truck_id), ''), s.cartons, s.order_status,
           coalesce(s.approved, false), coalesce(s.stock_checked, false), nullif(btrim(s.approved_by), ''), s.approved_at,
           nullif(btrim(s.created_by), ''), s.created_at, nullif(btrim(s.modified_by), ''), s.modified_at,
           nullif(btrim(s.payment_term), ''), nullif(btrim(s.so_type), ''), s.latitude, s.longitude, s.distance,
           round(s.value, 2),
           s.order_status = 1 and coalesce(s.approved, false),
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

create or replace function app.sheet_sync_finish(p_run uuid, p_status text, p_counts jsonb, p_errors jsonb, p_message text default null)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_trigger text;
begin
  if p_status not in ('ok', 'partial', 'failed') then
    raise exception 'invalid_input' using detail = 'Unknown sync status.';
  end if;
  update public.sheet_sync_runs
     set finished_at = now(), status = p_status,
         rows_read = coalesce((p_counts ->> 'rows_read')::integer, 0),
         updated = coalesce((p_counts ->> 'updated')::integer, 0),
         created = coalesce((p_counts ->> 'created')::integer, 0),
         unchanged = coalesce((p_counts ->> 'unchanged')::integer, 0),
         skipped = coalesce((p_counts ->> 'skipped')::integer, 0),
         contacts_updated = coalesce((p_counts ->> 'contacts_updated')::integer, 0),
         contacts_created = coalesce((p_counts ->> 'contacts_created')::integer, 0),
         orders = case when jsonb_typeof(p_counts -> 'orders') = 'object' then p_counts -> 'orders' else '{}'::jsonb end,
         errors = coalesce(p_errors, '[]'::jsonb), message = nullif(btrim(p_message), '')
   where id = p_run
  returning trigger into v_trigger;
  if p_status in ('ok', 'partial') and v_trigger <> 'preview' then
    update public.sheet_sync_settings set last_synced_at = now() where id;
  end if;
end;
$function$;

-- ---------------------------------------------------------------- wrappers

create function public.save_sheet_sync_orders(p_orders jsonb)
returns public.sheet_sync_settings language sql set search_path to ''
as $function$ select * from app.save_sheet_sync_orders(p_orders); $function$;

create function public.sheet_orders_apply(p_run uuid, p_rows jsonb, p_dry boolean default false)
returns jsonb language sql set search_path to ''
as $function$ select app.sheet_orders_apply(p_run, p_rows, p_dry); $function$;

revoke execute on function app.save_sheet_sync_orders(jsonb) from public;
revoke execute on function app.sheet_orders_apply(uuid, jsonb, boolean) from public;
revoke execute on function public.save_sheet_sync_orders(jsonb) from public, anon;
revoke execute on function public.sheet_orders_apply(uuid, jsonb, boolean) from public, anon, authenticated;

grant execute on function app.save_sheet_sync_orders(jsonb) to authenticated;
grant execute on function app.sheet_orders_apply(uuid, jsonb, boolean) to service_role;
grant execute on function public.save_sheet_sync_orders(jsonb) to authenticated;
grant execute on function public.sheet_orders_apply(uuid, jsonb, boolean) to service_role;
