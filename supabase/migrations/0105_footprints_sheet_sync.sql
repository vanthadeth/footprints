-- Footprints: Google Sheet sync for customers (Super Admin).
--
-- The Super Admin points Footprints at one to three tabs of a Google Sheet
-- shared as "Anyone with the link can view", maps their columns to customer
-- fields, and syncs on demand or on a schedule (hourly, every 6 hours, daily
-- or weekly, Phnom Penh time). The sheet-sync Edge Function downloads each
-- tab as CSV, maps and merges the rows by key (customers.sheet_id or
-- customers.code), and hands them to sheet_sync_apply here.
--
-- Rules (sheet_sync_apply):
--   * a row whose key matches a customer updates the mapped fields only;
--     empty cells never erase what's in the app;
--   * a row with no match creates a customer if it has a shop name, else it
--     is skipped (and reported);
--   * customers missing from the sheet are left alone;
--   * app-only data (map pin, photos, tier, notes, visits, posts) is never
--     touched; the owner changes only when a salesperson column is mapped
--     and matches an active user;
--   * phone / contact name go to the customer's first contact (created if
--     there is none).
--
-- Schedule: the sheet-sync cron job ticks every 15 minutes and calls the
-- Edge Function only when app.sheet_sync_due(). It authenticates with the
-- Vault secret 'sheet_sync_token', seeded once with execute_sql (never in a
-- migration):
--   select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'sheet_sync_token', 'Sheet sync cron -> Edge Function');
--
-- Applied live in four steps (footprints_sheet_sync, footprints_sheet_sync_begin_finish,
-- footprints_sheet_sync_apply, footprints_sheet_sync_wrappers_cron, footprints_sheet_sync_service_usage);
-- this file is their union.

-- ---------------------------------------------------------------- customers

alter table public.customers add column balance_usd numeric(14,2);

comment on column public.customers.balance_usd is
  'Customer balance (USD) from the Google Sheet sync; as of sheet_sync_settings.last_synced_at.';

create or replace view public.customer_directory with (security_invoker = true) as
 select c.id,
    c.shop_name,
    c.business_type,
    c.status,
    c.owner_id,
    u.full_name as owner_name,
    c.street_address,
    c.landmark,
    c.zipcode,
    c.latitude,
    c.longitude,
    c.credit_limit_usd,
    c.last_visit_date,
    c.last_purchase_date,
    coalesce(p.name, c.province_text) as province_name,
    c.district_text as district_name,
    c.commune_text as commune_name,
    c.province_code,
    ct.name as primary_contact_name,
    ct.phone as primary_contact_phone,
    pic.photo_path as primary_photo_path,
    (select count(*) as count
       from public.customer_contacts x
      where x.customer_id = c.id and x.active) as contact_count,
    c.balance_usd
   from public.customers c
     left join public.users u on u.id = c.owner_id
     left join public.geo_provinces p on p.code = c.province_code
     left join lateral (select x.name, x.phone
           from public.customer_contacts x
          where x.customer_id = c.id and x.active
          order by x.is_primary desc, x.sort_order, x.created_at
         limit 1) ct on true
     left join lateral (select y.photo_path
           from public.customer_pictures y
          where y.customer_id = c.id and y.active
          order by y.is_primary desc, y.sort_order, y.created_at
         limit 1) pic on true;

-- ---------------------------------------------------------------- tables

create table public.sheet_sync_settings (
  id              boolean primary key default true check (id),
  tabs            jsonb not null default '[]'::jsonb,
  date_order      text not null default 'dmy' check (date_order in ('dmy', 'mdy')),
  schedule        text not null default 'off' check (schedule in ('off', 'hourly', 'every6h', 'daily', 'weekly')),
  at_time         time not null default '06:00',
  weekday         smallint not null default 1 check (weekday between 1 and 7),
  next_run_at     timestamptz,
  last_synced_at  timestamptz,
  updated_by      uuid references public.users(id) on delete set null,
  updated_at      timestamptz not null default now()
);

comment on table public.sheet_sync_settings is
  'The one Google Sheet sync setup (Super Admin): tabs [{url, key:{column, matches sheet_id|code}, fields:{field: header}, balance_rows total|sum}], date order, schedule (Phnom Penh time).';

insert into public.sheet_sync_settings default values;

create table public.sheet_sync_runs (
  id           uuid primary key default gen_random_uuid(),
  trigger      text not null check (trigger in ('manual', 'schedule', 'preview')),
  started_by   uuid references public.users(id) on delete set null,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  status       text not null default 'running' check (status in ('running', 'ok', 'partial', 'failed')),
  rows_read    integer not null default 0,
  updated      integer not null default 0,
  created      integer not null default 0,
  unchanged    integer not null default 0,
  skipped      integer not null default 0,
  errors       jsonb not null default '[]'::jsonb,
  message      text
);

comment on table public.sheet_sync_runs is
  'One Google Sheet sync (or preview): counts and the first problems (tab, row, reason). Written only by the sheet-sync Edge Function.';

create index sheet_sync_runs_started_at_idx on public.sheet_sync_runs (started_at desc);

create function app.is_super_admin(p_uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select coalesce((select u.is_super_admin from public.users u where u.id = p_uid), false);
$function$;

alter table public.sheet_sync_settings enable row level security;
alter table public.sheet_sync_runs enable row level security;
create policy sheet_sync_settings_select on public.sheet_sync_settings for select using (app.is_super_admin());
create policy sheet_sync_runs_select on public.sheet_sync_runs for select using (app.is_super_admin());

-- ---------------------------------------------------------------- schedule

-- The next run after p_from for a schedule, in Phnom Penh time; null when off.
create function app.sheet_sync_next(p_from timestamptz, p_schedule text, p_at time, p_weekday smallint)
returns timestamptz
language plpgsql
stable
set search_path to ''
as $function$
declare
  v_local timestamp := p_from at time zone 'Asia/Phnom_Penh';
  v_cand  timestamp;
begin
  if p_schedule = 'hourly' then
    return (date_trunc('hour', v_local) + interval '1 hour') at time zone 'Asia/Phnom_Penh';
  elsif p_schedule = 'every6h' then
    return (date_trunc('day', v_local) + make_interval(hours => (floor(extract(hour from v_local) / 6)::integer + 1) * 6)) at time zone 'Asia/Phnom_Penh';
  elsif p_schedule = 'daily' then
    v_cand := date_trunc('day', v_local) + p_at;
    if v_cand <= v_local then v_cand := v_cand + interval '1 day'; end if;
    return v_cand at time zone 'Asia/Phnom_Penh';
  elsif p_schedule = 'weekly' then
    v_cand := date_trunc('day', v_local) + p_at + make_interval(days => (p_weekday - extract(isodow from v_local)::integer + 7) % 7);
    if v_cand <= v_local then v_cand := v_cand + interval '7 days'; end if;
    return v_cand at time zone 'Asia/Phnom_Penh';
  end if;
  return null;
end;
$function$;

-- Save the setup (Super Admin). Tabs are validated loosely here; the Edge
-- Function reports missing headers when it reads the sheet.
create function app.save_sheet_sync(p_tabs jsonb, p_date_order text, p_schedule text, p_at_time time, p_weekday smallint)
returns public.sheet_sync_settings
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_tab jsonb;
  v_row public.sheet_sync_settings;
begin
  if not app.is_super_admin() then
    raise exception 'insufficient_privilege' using errcode = 'insufficient_privilege', detail = 'Only a Super Admin can set up the Google Sheet sync.';
  end if;
  if jsonb_typeof(coalesce(p_tabs, 'null')) <> 'array' or jsonb_array_length(p_tabs) > 3 then
    raise exception 'invalid_input' using detail = 'Add one to three sheet tabs.';
  end if;
  if p_schedule not in ('off', 'hourly', 'every6h', 'daily', 'weekly') or p_date_order not in ('dmy', 'mdy') or p_weekday not between 1 and 7 then
    raise exception 'invalid_input' using detail = 'That schedule isn’t valid.';
  end if;
  if p_schedule <> 'off' and jsonb_array_length(p_tabs) = 0 then
    raise exception 'invalid_input' using detail = 'Add a sheet tab before turning on a schedule.';
  end if;
  for v_tab in select * from jsonb_array_elements(p_tabs) loop
    if coalesce(v_tab ->> 'url', '') !~ '^https://docs\.google\.com/spreadsheets/d/[A-Za-z0-9_-]+' then
      raise exception 'invalid_input' using detail = 'Each tab needs a Google Sheets link (docs.google.com/spreadsheets/d/…).';
    end if;
    if coalesce(btrim(v_tab -> 'key' ->> 'column'), '') = '' or coalesce(v_tab -> 'key' ->> 'matches', '') not in ('sheet_id', 'code') then
      raise exception 'invalid_input' using detail = 'Each tab needs a key column that matches the sheet row ID or the customer code.';
    end if;
    if jsonb_typeof(coalesce(v_tab -> 'fields', 'null')) <> 'object' then
      raise exception 'invalid_input' using detail = 'Each tab needs its column mapping.';
    end if;
  end loop;

  update public.sheet_sync_settings
     set tabs = p_tabs, date_order = p_date_order, schedule = p_schedule, at_time = p_at_time, weekday = p_weekday,
         next_run_at = app.sheet_sync_next(now(), p_schedule, p_at_time, p_weekday),
         updated_by = auth.uid(), updated_at = now()
   where id
  returning * into v_row;
  return v_row;
end;
$function$;

-- Whether the cron tick should start a scheduled sync now.
create function app.sheet_sync_due()
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists (
           select 1 from public.sheet_sync_settings s
            where s.schedule <> 'off' and s.next_run_at <= now() and jsonb_array_length(s.tabs) > 0)
     and not exists (
           select 1 from public.sheet_sync_runs r
            where r.status = 'running' and r.trigger <> 'preview' and r.started_at > now() - interval '15 minutes');
$function$;

-- When the balances in the app were last synced (for "as of" on the customer page).
create function app.sheet_balance_as_of()
returns timestamptz
language sql
stable
security definer
set search_path to ''
as $function$
  select s.last_synced_at from public.sheet_sync_settings s where s.id;
$function$;

-- ---------------------------------------------------------------- run (service role)

create function app.sheet_sync_token_ok(p_token text)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select coalesce(length(p_token) >= 32, false)
     and exists (select 1 from vault.decrypted_secrets d where d.name = 'sheet_sync_token' and d.decrypted_secret = p_token);
$function$;

-- Start a run; a scheduled run moves next_run_at forward at once so the next tick can't start it again.
create function app.sheet_sync_begin(p_trigger text, p_user uuid default null)
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
  if jsonb_array_length(v_set.tabs) = 0 then
    raise exception 'invalid_input' using detail = 'Add a sheet tab and save before syncing.';
  end if;
  if p_trigger = 'schedule' then
    update public.sheet_sync_settings
       set next_run_at = app.sheet_sync_next(now(), schedule, at_time, weekday)
     where id;
  end if;

  insert into public.sheet_sync_runs (trigger, started_by) values (p_trigger, p_user) returning id into v_id;
  return jsonb_build_object('run_id', v_id, 'tabs', v_set.tabs, 'date_order', v_set.date_order);
end;
$function$;

-- The rows of one batch, parsed, with the customer each matches (by sheet_id
-- or code) and whether a non-key code is unique within the batch. Called
-- repeatedly by sheet_sync_apply, so later calls see customers it created.
create function app.sheet_rows(p_rows jsonb)
returns table (
  key text, matches text, shop_name text, code text, business_type text, contact_name text, phone text,
  province_code text, province_text text, district text, commune text, street_address text, landmark text,
  credit_limit numeric, owner_id uuid, last_purchase_date date, balance_usd numeric,
  customer_id uuid, code_ok boolean
)
language sql
stable
set search_path to ''
as $function$
  select s.key, s.matches, s.shop_name, s.code, s.business_type, s.contact_name, s.phone,
         s.province_code, s.province_text, s.district, s.commune, s.street_address, s.landmark,
         s.credit_limit, s.owner_id, s.last_purchase_date, s.balance_usd,
         case when s.matches = 'code'
              then (select c.id from public.customers c where lower(c.code) = lower(btrim(s.key)))
              else (select c.id from public.customers c where c.sheet_id = btrim(s.key)) end,
         nullif(btrim(s.code), '') is not null
           and count(*) over (partition by lower(nullif(btrim(s.code), ''))) = 1
    from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as s(
           key text, matches text, shop_name text, code text, business_type text, contact_name text, phone text,
           province_code text, province_text text, district text, commune text, street_address text, landmark text,
           credit_limit numeric, owner_id uuid, last_purchase_date date, balance_usd numeric)
   where coalesce(btrim(s.key), '') <> '';
$function$;

-- Apply one batch of mapped rows. p_rows: [{key, matches: 'sheet_id'|'code',
-- shop_name, code, business_type, contact_name, phone, province_code,
-- province_text, district, commune, street_address, landmark, credit_limit,
-- owner_id, last_purchase_date, balance_usd}] -- keys unique, values already
-- parsed; null means "not in the sheet / empty cell", which never erases.
-- p_dry: count what would change, then roll the batch back.
create function app.sheet_sync_apply(p_run uuid, p_rows jsonb, p_dry boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user     uuid;
  v_counts   jsonb;
  v_matched  integer := 0;
  v_skipped  jsonb;
  v_new      uuid[] := '{}';
  v_touched  uuid[] := '{}';
  v_more     uuid[];
begin
  select r.started_by into v_user from public.sheet_sync_runs r where r.id = p_run;
  if not found then
    raise exception 'not_found' using detail = 'That sync run doesn’t exist.';
  end if;

  begin
    select count(*) filter (where r.customer_id is not null),
           coalesce(jsonb_agg(jsonb_build_object('key', r.key, 'reason', 'New row has no shop name'))
                      filter (where r.customer_id is null and coalesce(btrim(r.shop_name), '') = ''), '[]'::jsonb)
      into v_matched, v_skipped
      from app.sheet_rows(p_rows) r;

    -- Updates: only customers whose values actually change.
    with n as (
      select c.id,
             coalesce(nullif(btrim(r.shop_name), ''), c.shop_name) as shop_name,
             case when r.code_ok and r.matches <> 'code'
                       and not exists (select 1 from public.customers o where lower(o.code) = lower(btrim(r.code)) and o.id <> c.id)
                  then btrim(r.code) else c.code end as code,
             coalesce(nullif(btrim(r.business_type), ''), c.business_type) as business_type,
             coalesce(r.province_code, c.province_code) as province_code,
             case when r.province_code is not null then null else coalesce(nullif(btrim(r.province_text), ''), c.province_text) end as province_text,
             coalesce(nullif(btrim(r.district), ''), c.district_text) as district_text,
             coalesce(nullif(btrim(r.commune), ''), c.commune_text) as commune_text,
             coalesce(nullif(btrim(r.street_address), ''), c.street_address) as street_address,
             coalesce(nullif(btrim(r.landmark), ''), c.landmark) as landmark,
             coalesce(case when r.credit_limit >= 0 then round(r.credit_limit, 2) end, c.credit_limit_usd) as credit_limit_usd,
             coalesce(r.owner_id, c.owner_id) as owner_id,
             coalesce(r.last_purchase_date, c.last_purchase_date) as last_purchase_date,
             coalesce(round(r.balance_usd, 2), c.balance_usd) as balance_usd
        from app.sheet_rows(p_rows) r
        join public.customers c on c.id = r.customer_id
    ), upd as (
      update public.customers c
         set shop_name = n.shop_name, code = n.code, business_type = n.business_type,
             province_code = n.province_code, province_text = n.province_text, district_text = n.district_text,
             commune_text = n.commune_text, street_address = n.street_address, landmark = n.landmark,
             credit_limit_usd = n.credit_limit_usd, owner_id = n.owner_id,
             last_purchase_date = n.last_purchase_date, balance_usd = n.balance_usd
        from n
       where c.id = n.id
         and (n.shop_name, n.code, n.business_type, n.province_code, n.province_text, n.district_text, n.commune_text,
              n.street_address, n.landmark, n.credit_limit_usd, n.owner_id, n.last_purchase_date, n.balance_usd)
             is distinct from
             (c.shop_name, c.code, c.business_type, c.province_code, c.province_text, c.district_text, c.commune_text,
              c.street_address, c.landmark, c.credit_limit_usd, c.owner_id, c.last_purchase_date, c.balance_usd)
      returning c.id
    )
    select coalesce(array_agg(upd.id), '{}') into v_touched from upd;

    -- New customers.
    with ins as (
      insert into public.customers (shop_name, sheet_id, code, business_type, province_code, province_text, district_text, commune_text,
                                    street_address, landmark, credit_limit_usd, owner_id, last_purchase_date, balance_usd, created_by, status)
      select btrim(r.shop_name),
             case when r.matches = 'sheet_id' then btrim(r.key) end,
             case when r.matches = 'code' then btrim(r.key)
                  when r.code_ok and not exists (select 1 from public.customers o where lower(o.code) = lower(btrim(r.code)))
                    then btrim(r.code) end,
             nullif(btrim(r.business_type), ''), r.province_code,
             case when r.province_code is null then nullif(btrim(r.province_text), '') end,
             nullif(btrim(r.district), ''), nullif(btrim(r.commune), ''), nullif(btrim(r.street_address), ''), nullif(btrim(r.landmark), ''),
             coalesce(case when r.credit_limit >= 0 then round(r.credit_limit, 2) end, app.default_credit_limit()),
             r.owner_id, r.last_purchase_date, round(r.balance_usd, 2), v_user, 'active'
        from app.sheet_rows(p_rows) r
       where r.customer_id is null and coalesce(btrim(r.shop_name), '') <> ''
      returning id
    )
    select coalesce(array_agg(ins.id), '{}') into v_new from ins;

    -- Phone / contact name onto the first contact.
    with first_contact as (
      select distinct on (x.customer_id) x.id, x.customer_id
        from public.customer_contacts x
       where x.active and x.customer_id in (select r.customer_id from app.sheet_rows(p_rows) r)
       order by x.customer_id, x.is_primary desc, x.sort_order, x.created_at
    ), changed as (
      update public.customer_contacts x
         set name = coalesce(nullif(btrim(r.contact_name), ''), x.name),
             phone = coalesce(nullif(btrim(r.phone), ''), x.phone),
             updated_at = now()
        from first_contact f
        join app.sheet_rows(p_rows) r on r.customer_id = f.customer_id
       where x.id = f.id
         and (coalesce(nullif(btrim(r.contact_name), ''), x.name), coalesce(nullif(btrim(r.phone), ''), x.phone))
             is distinct from (x.name, x.phone)
      returning x.customer_id
    )
    select coalesce(array_agg(changed.customer_id), '{}') into v_more from changed;
    v_touched := v_touched || v_more;

    -- ... or a new first contact when there is none.
    with added as (
      insert into public.customer_contacts (customer_id, name, phone, sort_order)
      select r.customer_id, coalesce(nullif(btrim(r.contact_name), ''), btrim(c.shop_name)), nullif(btrim(r.phone), ''), 0
        from app.sheet_rows(p_rows) r
        join public.customers c on c.id = r.customer_id
       where (nullif(btrim(r.phone), '') is not null or nullif(btrim(r.contact_name), '') is not null)
         and not exists (select 1 from public.customer_contacts x where x.customer_id = r.customer_id and x.active)
      returning customer_id
    )
    select coalesce(array_agg(added.customer_id), '{}') into v_more from added;
    v_touched := v_touched || v_more;

    v_counts := jsonb_build_object(
      'updated', (select count(distinct t) from unnest(v_touched) t where not (t = any(v_new))),
      'created', cardinality(v_new),
      'skipped', jsonb_array_length(v_skipped),
      'skipped_rows', (select coalesce(jsonb_agg(e), '[]'::jsonb) from (select e from jsonb_array_elements(v_skipped) e limit 50) s));
    v_counts := v_counts || jsonb_build_object('unchanged', greatest(v_matched - (v_counts ->> 'updated')::integer, 0));

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

create function app.sheet_sync_finish(p_run uuid, p_status text, p_counts jsonb, p_errors jsonb, p_message text default null)
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
         errors = coalesce(p_errors, '[]'::jsonb), message = nullif(btrim(p_message), '')
   where id = p_run
  returning trigger into v_trigger;
  if p_status in ('ok', 'partial') and v_trigger <> 'preview' then
    update public.sheet_sync_settings set last_synced_at = now() where id;
  end if;
end;
$function$;

-- ---------------------------------------------------------------- wrappers

create function public.save_sheet_sync(p_tabs jsonb, p_date_order text, p_schedule text, p_at_time time, p_weekday smallint)
returns public.sheet_sync_settings language sql set search_path to ''
as $function$ select * from app.save_sheet_sync(p_tabs, p_date_order, p_schedule, p_at_time, p_weekday); $function$;

create function public.sheet_balance_as_of()
returns timestamptz language sql stable set search_path to ''
as $function$ select app.sheet_balance_as_of(); $function$;

create function public.sheet_sync_token_ok(p_token text)
returns boolean language sql stable set search_path to ''
as $function$ select app.sheet_sync_token_ok(p_token); $function$;

create function public.sheet_sync_begin(p_trigger text, p_user uuid default null)
returns jsonb language sql set search_path to ''
as $function$ select app.sheet_sync_begin(p_trigger, p_user); $function$;

create function public.sheet_sync_apply(p_run uuid, p_rows jsonb, p_dry boolean default false)
returns jsonb language sql set search_path to ''
as $function$ select app.sheet_sync_apply(p_run, p_rows, p_dry); $function$;

create function public.sheet_sync_finish(p_run uuid, p_status text, p_counts jsonb, p_errors jsonb, p_message text default null)
returns void language sql set search_path to ''
as $function$ select app.sheet_sync_finish(p_run, p_status, p_counts, p_errors, p_message); $function$;

revoke execute on function app.is_super_admin(uuid) from public;
revoke execute on function app.sheet_sync_next(timestamptz, text, time, smallint) from public;
revoke execute on function app.save_sheet_sync(jsonb, text, text, time, smallint) from public;
revoke execute on function app.sheet_sync_due() from public;
revoke execute on function app.sheet_balance_as_of() from public;
revoke execute on function app.sheet_sync_token_ok(text) from public;
revoke execute on function app.sheet_sync_begin(text, uuid) from public;
revoke execute on function app.sheet_rows(jsonb) from public;
revoke execute on function app.sheet_sync_apply(uuid, jsonb, boolean) from public;
revoke execute on function app.sheet_sync_finish(uuid, text, jsonb, jsonb, text) from public;
revoke execute on function public.save_sheet_sync(jsonb, text, text, time, smallint) from public, anon;
revoke execute on function public.sheet_balance_as_of() from public, anon;
revoke execute on function public.sheet_sync_token_ok(text) from public, anon, authenticated;
revoke execute on function public.sheet_sync_begin(text, uuid) from public, anon, authenticated;
revoke execute on function public.sheet_sync_apply(uuid, jsonb, boolean) from public, anon, authenticated;
revoke execute on function public.sheet_sync_finish(uuid, text, jsonb, jsonb, text) from public, anon, authenticated;

grant execute on function app.is_super_admin(uuid) to authenticated, service_role;
grant execute on function app.sheet_sync_next(timestamptz, text, time, smallint) to authenticated, service_role;
grant execute on function app.save_sheet_sync(jsonb, text, text, time, smallint) to authenticated;
grant execute on function app.sheet_balance_as_of() to authenticated;
grant execute on function app.sheet_sync_token_ok(text) to service_role;
grant execute on function app.sheet_sync_begin(text, uuid) to service_role;
grant execute on function app.sheet_sync_apply(uuid, jsonb, boolean) to service_role;
grant execute on function app.sheet_sync_finish(uuid, text, jsonb, jsonb, text) to service_role;
grant execute on function public.save_sheet_sync(jsonb, text, text, time, smallint) to authenticated;
grant execute on function public.sheet_balance_as_of() to authenticated;
grant execute on function public.sheet_sync_token_ok(text) to service_role;
grant execute on function public.sheet_sync_begin(text, uuid) to service_role;
grant execute on function public.sheet_sync_apply(uuid, jsonb, boolean) to service_role;
grant execute on function public.sheet_sync_finish(uuid, text, jsonb, jsonb, text) to service_role;
-- The Edge Function calls the public wrappers as service_role; they're plain SQL over app.*.
grant usage on schema app to service_role;
grant select on public.sheet_sync_settings, public.sheet_sync_runs to authenticated;
grant select, insert, update, delete on public.sheet_sync_settings, public.sheet_sync_runs to service_role;

-- ---------------------------------------------------------------- cron

select cron.schedule(
  'sheet-sync',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://wbyrluggvuvnhxzfaeye.supabase.co/functions/v1/sheet-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sheet-sync-token', (select decrypted_secret from vault.decrypted_secrets where name = 'sheet_sync_token' limit 1)
    ),
    body := '{"action":"run","trigger":"schedule"}'::jsonb
  ) as request_id
  where app.sheet_sync_due();
  $$
);
