-- Footprints: Google Sheet sync -- contacts, map pin, zipcode, remarks, tab names.
--
-- Brings the previous app's customer + contact syncs (sync_definitions
-- "Customers" and "Customer phone 1/2/3", all reading the CUS tab) into the
-- Google Sheet sync from 0105:
--   * customers gain zipcode, remarks and latitude / longitude (one
--     "lat, long" column, split by the Edge Function);
--   * a tab can name up to three contact slots {phone, label, fallback}.
--     Each non-empty phone is its own customer_contacts row with
--     sheet_id = <row ID>#<slot>, the same keys the old sync wrote, so the
--     existing 2,652 contacts update in place. An empty phone leaves the
--     contact alone (as before); nothing is retired;
--   * a tab can be found by name ("tab") instead of a #gid= in its link.
-- sheet_sync_runs counts contact changes separately.
--
-- Applied live in four steps (footprints_sheet_sync_contacts,
-- footprints_sheet_sync_contacts_save, footprints_sheet_sync_contacts_rows,
-- footprints_sheet_sync_contacts_apply); this file is their union.

alter table public.sheet_sync_runs
  add column contacts_updated integer not null default 0,
  add column contacts_created integer not null default 0;

comment on table public.sheet_sync_settings is
  'The one Google Sheet sync setup (Super Admin): tabs [{url, tab?, key:{column, matches sheet_id|code}, fields:{field: header}, contacts?:[{phone, label, fallback}], balance_rows total|sum}], date order, schedule (Phnom Penh time).';

-- ---------------------------------------------------------------- save

create or replace function app.save_sheet_sync(p_tabs jsonb, p_date_order text, p_schedule text, p_at_time time, p_weekday smallint)
returns public.sheet_sync_settings
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_tab jsonb;
  v_contact jsonb;
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
    if v_tab ? 'tab' and jsonb_typeof(v_tab -> 'tab') not in ('string', 'null') then
      raise exception 'invalid_input' using detail = 'A tab name must be text.';
    end if;
    if v_tab ? 'contacts' and jsonb_typeof(v_tab -> 'contacts') <> 'null' then
      if jsonb_typeof(v_tab -> 'contacts') <> 'array' or jsonb_array_length(v_tab -> 'contacts') > 3 then
        raise exception 'invalid_input' using detail = 'A tab can sync up to three contacts.';
      end if;
      if jsonb_array_length(v_tab -> 'contacts') > 0 and v_tab -> 'key' ->> 'matches' <> 'sheet_id' then
        raise exception 'invalid_input' using detail = 'Contacts need the key column to match the sheet row ID.';
      end if;
      for v_contact in select * from jsonb_array_elements(v_tab -> 'contacts') loop
        if coalesce(btrim(v_contact ->> 'phone'), '') = '' then
          raise exception 'invalid_input' using detail = 'Each contact needs its phone column.';
        end if;
      end loop;
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

-- ---------------------------------------------------------------- batch rows

-- The rows of one batch, parsed, with the customer each matches (by sheet_id
-- or code) and whether a non-key code is unique within the batch. Called
-- repeatedly by sheet_sync_apply, so later calls see customers it created.
-- Replaces app.sheet_rows (0105), which sheet_sync_apply no longer calls; a
-- new name because the row type changed and a drop can't run through the
-- migration tool.
create function app.sheet_batch_rows(p_rows jsonb)
returns table (
  key text, matches text, shop_name text, code text, business_type text, contact_name text, phone text,
  province_code text, province_text text, district text, commune text, street_address text, landmark text,
  zipcode text, remarks text, latitude numeric, longitude numeric,
  credit_limit numeric, owner_id uuid, last_purchase_date date, balance_usd numeric, contacts jsonb,
  customer_id uuid, code_ok boolean
)
language sql
stable
set search_path to ''
as $function$
  select s.key, s.matches, s.shop_name, s.code, s.business_type, s.contact_name, s.phone,
         s.province_code, s.province_text, s.district, s.commune, s.street_address, s.landmark,
         s.zipcode, s.remarks,
         case when s.latitude between -90 and 90 and s.longitude between -180 and 180 then s.latitude end,
         case when s.latitude between -90 and 90 and s.longitude between -180 and 180 then s.longitude end,
         s.credit_limit, s.owner_id, s.last_purchase_date, s.balance_usd,
         case when jsonb_typeof(s.contacts) = 'array' then s.contacts else '[]'::jsonb end,
         case when s.matches = 'code'
              then (select c.id from public.customers c where lower(c.code) = lower(btrim(s.key)))
              else (select c.id from public.customers c where c.sheet_id = btrim(s.key)) end,
         nullif(btrim(s.code), '') is not null
           and count(*) over (partition by lower(nullif(btrim(s.code), ''))) = 1
    from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as s(
           key text, matches text, shop_name text, code text, business_type text, contact_name text, phone text,
           province_code text, province_text text, district text, commune text, street_address text, landmark text,
           zipcode text, remarks text, latitude numeric, longitude numeric,
           credit_limit numeric, owner_id uuid, last_purchase_date date, balance_usd numeric, contacts jsonb)
   where coalesce(btrim(s.key), '') <> '';
$function$;

revoke execute on function app.sheet_batch_rows(jsonb) from public;

-- ---------------------------------------------------------------- apply

-- Apply one batch of mapped rows. p_rows: [{key, matches: 'sheet_id'|'code',
-- shop_name, code, business_type, contact_name, phone, province_code,
-- province_text, district, commune, street_address, landmark, zipcode,
-- remarks, latitude, longitude, credit_limit, owner_id, last_purchase_date,
-- balance_usd, contacts: [{slot, name, phone}]}] -- keys unique, values
-- already parsed; null means "not in the sheet / empty cell", which never
-- erases. p_dry: count what would change, then roll the batch back.
create or replace function app.sheet_sync_apply(p_run uuid, p_rows jsonb, p_dry boolean default false)
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
  v_c_upd    integer := 0;
  v_c_new    integer := 0;
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
      from app.sheet_batch_rows(p_rows) r;

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
             coalesce(nullif(btrim(r.zipcode), ''), c.zipcode) as zipcode,
             coalesce(nullif(btrim(r.remarks), ''), c.remarks) as remarks,
             coalesce(r.latitude, c.latitude) as latitude,
             coalesce(r.longitude, c.longitude) as longitude,
             coalesce(case when r.credit_limit >= 0 then round(r.credit_limit, 2) end, c.credit_limit_usd) as credit_limit_usd,
             coalesce(r.owner_id, c.owner_id) as owner_id,
             coalesce(r.last_purchase_date, c.last_purchase_date) as last_purchase_date,
             coalesce(round(r.balance_usd, 2), c.balance_usd) as balance_usd
        from app.sheet_batch_rows(p_rows) r
        join public.customers c on c.id = r.customer_id
    ), upd as (
      update public.customers c
         set shop_name = n.shop_name, code = n.code, business_type = n.business_type,
             province_code = n.province_code, province_text = n.province_text, district_text = n.district_text,
             commune_text = n.commune_text, street_address = n.street_address, landmark = n.landmark,
             zipcode = n.zipcode, remarks = n.remarks, latitude = n.latitude, longitude = n.longitude,
             credit_limit_usd = n.credit_limit_usd, owner_id = n.owner_id,
             last_purchase_date = n.last_purchase_date, balance_usd = n.balance_usd
        from n
       where c.id = n.id
         and (n.shop_name, n.code, n.business_type, n.province_code, n.province_text, n.district_text, n.commune_text,
              n.street_address, n.landmark, n.zipcode, n.remarks, n.latitude, n.longitude,
              n.credit_limit_usd, n.owner_id, n.last_purchase_date, n.balance_usd)
             is distinct from
             (c.shop_name, c.code, c.business_type, c.province_code, c.province_text, c.district_text, c.commune_text,
              c.street_address, c.landmark, c.zipcode, c.remarks, c.latitude, c.longitude,
              c.credit_limit_usd, c.owner_id, c.last_purchase_date, c.balance_usd)
      returning c.id
    )
    select coalesce(array_agg(upd.id), '{}') into v_touched from upd;

    -- New customers.
    with ins as (
      insert into public.customers (shop_name, sheet_id, code, business_type, province_code, province_text, district_text, commune_text,
                                    street_address, landmark, zipcode, remarks, latitude, longitude,
                                    credit_limit_usd, owner_id, last_purchase_date, balance_usd, created_by, status)
      select btrim(r.shop_name),
             case when r.matches = 'sheet_id' then btrim(r.key) end,
             case when r.matches = 'code' then btrim(r.key)
                  when r.code_ok and not exists (select 1 from public.customers o where lower(o.code) = lower(btrim(r.code)))
                    then btrim(r.code) end,
             nullif(btrim(r.business_type), ''), r.province_code,
             case when r.province_code is null then nullif(btrim(r.province_text), '') end,
             nullif(btrim(r.district), ''), nullif(btrim(r.commune), ''), nullif(btrim(r.street_address), ''), nullif(btrim(r.landmark), ''),
             nullif(btrim(r.zipcode), ''), nullif(btrim(r.remarks), ''), r.latitude, r.longitude,
             coalesce(case when r.credit_limit >= 0 then round(r.credit_limit, 2) end, app.default_credit_limit()),
             r.owner_id, r.last_purchase_date, round(r.balance_usd, 2), v_user, 'active'
        from app.sheet_batch_rows(p_rows) r
       where r.customer_id is null and coalesce(btrim(r.shop_name), '') <> ''
      returning id
    )
    select coalesce(array_agg(ins.id), '{}') into v_new from ins;

    -- Phone / contact name onto the first contact.
    with first_contact as (
      select distinct on (x.customer_id) x.id, x.customer_id
        from public.customer_contacts x
       where x.active and x.customer_id in (select r.customer_id from app.sheet_batch_rows(p_rows) r)
       order by x.customer_id, x.is_primary desc, x.sort_order, x.created_at
    ), changed as (
      update public.customer_contacts x
         set name = coalesce(nullif(btrim(r.contact_name), ''), x.name),
             phone = coalesce(nullif(btrim(r.phone), ''), x.phone),
             updated_at = now()
        from first_contact f
        join app.sheet_batch_rows(p_rows) r on r.customer_id = f.customer_id
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
        from app.sheet_batch_rows(p_rows) r
        join public.customers c on c.id = r.customer_id
       where (nullif(btrim(r.phone), '') is not null or nullif(btrim(r.contact_name), '') is not null)
         and not exists (select 1 from public.customer_contacts x where x.customer_id = r.customer_id and x.active)
      returning customer_id
    )
    select coalesce(array_agg(added.customer_id), '{}') into v_more from added;
    v_touched := v_touched || v_more;

    -- Contact slots: one contact per non-empty phone, kept in step by
    -- sheet_id = <row ID>#<slot>. Retired contacts stay retired.
    with s as (
      select r.customer_id,
             btrim(r.key) || '#' || (e ->> 'slot') as sheet_id,
             coalesce(nullif(btrim(e ->> 'name'), ''), 'Phone ' || (e ->> 'slot')) as name,
             btrim(e ->> 'phone') as phone
        from app.sheet_batch_rows(p_rows) r
        cross join lateral jsonb_array_elements(r.contacts) e
       where r.matches = 'sheet_id' and r.customer_id is not null
         and (e ->> 'slot') ~ '^[1-3]$' and nullif(btrim(e ->> 'phone'), '') is not null
    ), changed as (
      update public.customer_contacts x
         set name = s.name, phone = s.phone, customer_id = s.customer_id, updated_at = now()
        from s
       where x.sheet_id = s.sheet_id
         and (s.name, s.phone, s.customer_id) is distinct from (x.name, x.phone, x.customer_id)
      returning x.id
    )
    select count(*) into v_c_upd from changed;

    with s as (
      select r.customer_id,
             btrim(r.key) || '#' || (e ->> 'slot') as sheet_id,
             coalesce(nullif(btrim(e ->> 'name'), ''), 'Phone ' || (e ->> 'slot')) as name,
             btrim(e ->> 'phone') as phone,
             (e ->> 'slot')::integer as slot
        from app.sheet_batch_rows(p_rows) r
        cross join lateral jsonb_array_elements(r.contacts) e
       where r.matches = 'sheet_id' and r.customer_id is not null
         and (e ->> 'slot') ~ '^[1-3]$' and nullif(btrim(e ->> 'phone'), '') is not null
    ), added as (
      insert into public.customer_contacts (customer_id, sheet_id, name, phone, sort_order)
      select s.customer_id, s.sheet_id, s.name, s.phone, s.slot
        from s
       where not exists (select 1 from public.customer_contacts x where x.sheet_id = s.sheet_id)
      returning id
    )
    select count(*) into v_c_new from added;

    v_counts := jsonb_build_object(
      'updated', (select count(distinct t) from unnest(v_touched) t where not (t = any(v_new))),
      'created', cardinality(v_new),
      'skipped', jsonb_array_length(v_skipped),
      'contacts_updated', v_c_upd,
      'contacts_created', v_c_new,
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
         errors = coalesce(p_errors, '[]'::jsonb), message = nullif(btrim(p_message), '')
   where id = p_run
  returning trigger into v_trigger;
  if p_status in ('ok', 'partial') and v_trigger <> 'preview' then
    update public.sheet_sync_settings set last_synced_at = now() where id;
  end if;
end;
$function$;
