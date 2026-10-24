-- Footprints: one sheet, many tables -- sync sources.
--
-- Applied live (as footprints_sync_sources) after a rolled-back dry run: the 9
-- existing definitions became 6 sources (CUS holds four mappings, the other
-- five one each); the three phone mappings point at Customers as their parent.
--
-- Today a sync_definition is one Google Sheet tab feeding ONE table, so the
-- customer tab "CUS" is entered four times (Customers + Customer phone 1/2/3),
-- each repeating the sheet link and fetching the tab again. This migration
-- adds the missing level above it:
--
--   sync_sources      one sheet tab (link, tab, header row)
--     └─ sync_definitions ("mappings")  one target table each, in order;
--          parent_id says "my rows belong to a row of that mapping"
--          (customer_contacts → customers), so a run applies parents first
--          and children link to them by the sheet row ID.
--
-- Additive only. Nothing existing is changed in behaviour:
--   * existing sync_definitions keep every column and value; they gain
--     source_id / parent_id / engine / handler, all backfilled below;
--   * engine = 'legacy' for all of them. Whatever runs them today (nothing in
--     this database does; their last runs were manual, the newest on
--     2026-09-19) keeps working exactly as before. A definition only moves to
--     the Footprints engine ('footprints') when a Super Admin switches it,
--     which also sets active = false so the legacy runner skips it;
--   * handler names the few rules that need code rather than a column map:
--     'customers' (province + salesperson lookup, balance merging across
--     tabs) and 'sale_orders' (orders with lines). Null = a plain column map
--     through sync_column_maps and the sync_targets safety list.
--
-- Reads follow the existing data_sync permission; there are no write
-- policies, so sources are only changed through RPCs added with the engine.

create table public.sync_sources (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (btrim(name) <> ''),
  spreadsheet_id  text not null,
  tab_name        text not null,
  header_row      integer not null default 1 check (header_row >= 1),
  active          boolean not null default true,
  created_by      uuid references public.users(id) on delete set null default auth.uid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (spreadsheet_id, tab_name)
);

comment on table public.sync_sources is
  'One Google Sheet tab that feeds one or more tables. Its mappings are the sync_definitions with this source_id.';

alter table public.sync_definitions
  add column source_id uuid references public.sync_sources(id) on delete restrict,
  add column parent_id uuid references public.sync_definitions(id) on delete set null,
  add column engine    text not null default 'legacy' check (engine in ('legacy', 'footprints')),
  add column handler   text check (handler in ('customers', 'sale_orders')),
  add constraint sync_definitions_not_own_parent check (parent_id is distinct from id);

comment on column public.sync_definitions.source_id is 'The sheet tab this mapping reads.';
comment on column public.sync_definitions.parent_id is 'The mapping whose rows these belong to (applied after it; linked by the sheet row ID).';
comment on column public.sync_definitions.engine is 'legacy = run by whatever ran it before; footprints = run by the sheet-sync engine.';
comment on column public.sync_definitions.handler is 'Rules that need code (customers, sale_orders); null = plain column map.';

-- Backfill: one source per distinct sheet tab, then link the definitions.
insert into public.sync_sources (name, spreadsheet_id, tab_name, header_row, created_by)
select d.tab_name, d.spreadsheet_id, d.tab_name, min(d.header_row), null
  from public.sync_definitions d
 group by d.spreadsheet_id, d.tab_name;

update public.sync_definitions d
   set source_id = s.id
  from public.sync_sources s
 where s.spreadsheet_id = d.spreadsheet_id and s.tab_name = d.tab_name;

-- A contact belongs to the customer on the same sheet row.
update public.sync_definitions c
   set parent_id = p.id
  from public.sync_definitions p
 where c.target_table = 'customer_contacts' and p.target_table = 'customers' and p.source_id = c.source_id;

update public.sync_definitions set handler = 'customers' where target_table = 'customers';

alter table public.sync_definitions alter column source_id set not null;
create index sync_definitions_source_idx on public.sync_definitions (source_id);

-- A parent must read the same sheet tab as its child.
create function app.sync_parent_same_source() returns trigger
language plpgsql set search_path to ''
as $function$
begin
  if new.parent_id is not null and not exists (
    select 1 from public.sync_definitions p where p.id = new.parent_id and p.source_id = new.source_id
  ) then
    raise exception 'invalid_input' using detail = 'A mapping and its parent must read the same sheet tab.';
  end if;
  return new;
end;
$function$;

create trigger sync_definitions_parent_same_source
  before insert or update of parent_id, source_id on public.sync_definitions
  for each row execute function app.sync_parent_same_source();

alter table public.sync_sources enable row level security;
create policy sync_sources_select on public.sync_sources for select using (app.can('data_sync', 'view'));

revoke all on public.sync_sources from anon, public;
grant select on public.sync_sources to authenticated;
revoke execute on function app.sync_parent_same_source() from public, anon, authenticated;
