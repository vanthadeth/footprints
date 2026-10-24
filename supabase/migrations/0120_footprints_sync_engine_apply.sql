-- Footprints: sync engine -- apply one batch of rows to a mapping.
--
-- Applied live (as footprints_sync_engine_apply) after a rolled-back dry run against
-- the real brands and geo_provinces tables, then verified: service role can execute,
-- anon and authenticated cannot, and no mapping is on the Footprints engine yet.
--
-- The source-sync Edge Function reads a sheet tab once, converts each
-- mapping's rows to objects keyed by TARGET column (supabase/functions/
-- sheet-sync/engine.ts), and calls this per mapping, per batch.
--
-- app.sync_engine_apply is app.sync_apply (0000s, used by the older runner)
-- with four deliberate differences:
--   * it runs mappings with engine = 'footprints' (active may be false: that
--     is how the older runner is told to skip a mapping that has moved);
--   * an empty cell never erases what is in the table:
--     col = coalesce(excluded.col, tgt.col), the same rule as the customer
--     sync;
--   * rows whose values would not change are not written, and the result
--     counts added / updated / unchanged;
--   * p_dry counts what would change, then rolls the batch back.
-- Which columns may be written, and how a row is matched, are unchanged: the
-- sync_targets safety list (app.sync_columns) and the sheet_id / natural-key
-- conflict target. A column map with a reference_table carries the parent
-- row's sheet ID, which is turned into that row's key here.
--
-- Callable by the service role only (the Edge Function); nobody signed in can
-- call it from the app.

create function app.sync_engine_apply(p_sync uuid, p_rows jsonb, p_dry boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_table    text;
  v_match    public.sync_match;
  v_conflict text;
  v_collist  text;
  v_selects  text;
  v_updates  text;
  v_old      text;
  v_new      text;
  v_refkeys  text[];
  v_total    integer := jsonb_array_length(coalesce(p_rows, '[]'::jsonb));
  v_inserted integer := 0;
  v_updated  integer := 0;
begin
  select d.target_table, d.match_on
    into v_table, v_match
    from public.sync_definitions d
   where d.id = p_sync and d.engine = 'footprints';

  if v_table is null then
    raise exception 'sync: % is not a mapping on the Footprints engine', p_sync using errcode = 'no_data_found';
  end if;

  if v_match = 'sheet_id' then
    v_conflict := '(sheet_id) where sheet_id is not null';
  else
    select t.conflict_target into v_conflict from public.sync_targets t where t.table_name = v_table;
  end if;
  if v_conflict is null then
    raise exception 'sync: % has no key to match rows on', v_table using errcode = 'check_violation';
  end if;

  with mapped as (
    select distinct on (m.target_column) m.target_column, m.reference_table, m.sort_order, rt.pk_column as ref_pk
      from public.sync_column_maps m
      left join public.sync_targets rt on rt.table_name = m.reference_table
     where m.sync_id = p_sync
       and m.target_column is not null
       and exists (select 1 from app.sync_columns(v_table) c where c.column_name = m.target_column)
     order by m.target_column, m.sort_order
  )
  select
    string_agg(quote_ident(target_column), ', ' order by sort_order),
    string_agg(
      case when reference_table is null then format('t.%I', target_column)
           else format('(select x.%I from public.%I x where x.sheet_id = r->>%L)', ref_pk, reference_table, target_column) end,
      ', ' order by sort_order),
    string_agg(format('%I = coalesce(excluded.%I, tgt.%I)', target_column, target_column, target_column), ', ' order by sort_order),
    string_agg(format('tgt.%I', target_column), ', ' order by sort_order),
    string_agg(format('coalesce(excluded.%I, tgt.%I)', target_column, target_column), ', ' order by sort_order),
    array_remove(array_agg(case when reference_table is null then null else target_column end), null)
    into v_collist, v_selects, v_updates, v_old, v_new, v_refkeys
  from mapped;

  if v_collist is null then
    raise exception 'sync: nothing is mapped' using errcode = 'check_violation';
  end if;

  begin
    execute format(
      'with up as ('
      || 'insert into public.%I as tgt (%s) select %s '
      || 'from jsonb_array_elements($1) as r '
      || 'cross join lateral jsonb_populate_record(null::public.%I, r - $2) as t '
      || 'on conflict %s do update set %s where (%s) is distinct from (%s) '
      || 'returning (xmax = 0) as inserted) '
      || 'select count(*) filter (where inserted)::integer, count(*) filter (where not inserted)::integer from up',
      v_table, v_collist, v_selects, v_table, v_conflict, v_updates, v_old, v_new
    ) into v_inserted, v_updated using p_rows, coalesce(v_refkeys, array[]::text[]);

    if p_dry then
      raise exception 'sync_engine_dry_run' using errcode = 'P0999';
    end if;
  exception when sqlstate 'P0999' then
    null; -- the batch is rolled back; the counts above are kept
  end;

  return jsonb_build_object('inserted', v_inserted, 'updated', v_updated, 'unchanged', v_total - v_inserted - v_updated);
end;
$function$;

create function public.sync_engine_apply(p_sync uuid, p_rows jsonb, p_dry boolean default false)
returns jsonb language sql security definer set search_path to ''
as $function$ select app.sync_engine_apply(p_sync, p_rows, p_dry); $function$;

revoke execute on function app.sync_engine_apply(uuid, jsonb, boolean) from public;
revoke execute on function public.sync_engine_apply(uuid, jsonb, boolean) from public, anon, authenticated;
grant execute on function app.sync_engine_apply(uuid, jsonb, boolean) to service_role;
grant execute on function public.sync_engine_apply(uuid, jsonb, boolean) to service_role;
