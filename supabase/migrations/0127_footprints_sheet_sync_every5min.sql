-- Customer + sale order sheet sync every 5 minutes: a new 'every5min' schedule,
-- a */5 cron tick (was */15), and a 10-minute stuck-run window (was 15).

-- Allow the new schedule value.
do $$
declare v_con text;
begin
  select conname into v_con from pg_constraint
   where conrelid = 'public.sheet_sync_settings'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%every6h%';
  if v_con is not null then
    execute format('alter table public.sheet_sync_settings drop constraint %I', v_con);
  end if;
end $$;
alter table public.sheet_sync_settings
  add constraint sheet_sync_settings_schedule_check check (schedule in ('off', 'hourly', 'every6h', 'daily', 'weekly', 'every5min'));

create or replace function app.sheet_sync_next(p_from timestamptz, p_schedule text, p_at time, p_weekday smallint)
returns timestamptz
language plpgsql
stable
set search_path to ''
as $function$
declare
  v_local timestamp := p_from at time zone 'Asia/Phnom_Penh';
  v_cand  timestamp;
begin
  if p_schedule = 'every5min' then
    return (date_trunc('hour', v_local) + (floor(extract(minute from v_local) / 5)::integer + 1) * interval '5 minutes') at time zone 'Asia/Phnom_Penh';
  elsif p_schedule = 'hourly' then
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
  if p_schedule not in ('off', 'hourly', 'every6h', 'daily', 'weekly', 'every5min') or p_date_order not in ('dmy', 'mdy') or p_weekday not between 1 and 7 then
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
            where r.status = 'running' and r.trigger <> 'preview' and r.started_at > now() - interval '10 minutes');
$function$;

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
     where r.status = 'running' and r.trigger <> 'preview' and r.started_at > now() - interval '10 minutes'
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

-- Poll every 5 minutes; sheet_sync_due() still gates the actual run.
select cron.alter_job(
  (select jobid from cron.job where jobname = 'sheet-sync'),
  schedule := '*/5 * * * *'
);

-- Move every active schedule to 5 minutes.
update public.sheet_sync_settings
   set schedule = 'every5min', next_run_at = now()
 where schedule <> 'off';
