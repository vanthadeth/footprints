-- Footprints: invoices and payment terms, synced from the Google Sheets.
--
-- Two new tables the source-sync engine (0119, 0120) can fill:
--
--   payment_terms  the PAYMENT_TERM tab of the settings sheet. A term has up to three
--                  periods, each with an early-payment discount (PERIOD_1/TERM_1 ...).
--                  due_days is its LATEST period, so a term with periods 0 and 30 is due
--                  after 30 days and a cash term (period 0) is due the day it is issued.
--   invoices       the INV tab of the invoice sheet, keyed by the sheet's ID column. Every
--                  status is imported (0 draft, 5 submitted, 9 void) and kept in `status`
--                  so reports can leave voids out. INVD (the invoice lines) is not synced.
--
-- The sheet's own DUE_DATE, PDF_PATH and MD / MDTS columns are not mapped. The due date is
-- worked out from the invoice date and the payment term (view invoice_details), so a
-- change to a term moves the due dates of its invoices without another sync.
--
-- Links, as for sale orders: ASSIGN_TO names the salesperson by the IDs a Super Admin set
-- per user (user_sheet_ids; first ID in the cell that belongs to an active user), the
-- customer is CUSTOMER_ID = customers.sheet_id, and SO_ID = sale_orders.sheet_id. An
-- invoice with no SO_ID (the 2020 ones entered in 2021) simply has no sale order. The
-- engine only writes rows whose values changed, so a link that could not be made at
-- first (the customer or an ID arrives later) is made by public.invoices_relink(), which
-- the source-sync function calls after it applies an invoices mapping.
--
-- A sheet can now say how its dates are written: sync_sources.date_order (null = the
-- global setting). The invoice sheet writes dates month first (8/18/2021); read day
-- first, 9/1/2021 would silently become 9 January.

-- ---------------------------------------------------------------- payment terms

create table public.payment_terms (
  id          uuid primary key default gen_random_uuid(),
  sheet_id    text not null,
  period_1    integer check (period_1 is null or period_1 >= 0),
  term_1      numeric,
  period_2    integer check (period_2 is null or period_2 >= 0),
  term_2      numeric,
  period_3    integer check (period_3 is null or period_3 >= 0),
  term_3      numeric,
  is_default  boolean,
  active      boolean,
  due_days    integer generated always as (greatest(coalesce(period_1, 0), coalesce(period_2, 0), coalesce(period_3, 0))) stored,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index payment_terms_sheet_id_key on public.payment_terms (sheet_id) where sheet_id is not null;

comment on column public.payment_terms.sheet_id is 'The term''s ID in the PAYMENT_TERM tab; invoices.payment_term holds it.';
comment on column public.payment_terms.term_1 is 'Early-payment discount in percent points (7 = 7%) for paying within period_1 days.';
comment on column public.payment_terms.due_days is 'Days after the invoice date that the invoice is due: the latest of period_1..3.';

create trigger payment_terms_set_updated_at
  before update on public.payment_terms
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- invoices

create table public.invoices (
  id                uuid primary key default gen_random_uuid(),
  sheet_id          text not null,
  inv_no            text,
  inv_date          date,
  customer_sheet_id text,
  customer_id       uuid references public.customers (id) on delete set null,
  so_sheet_id       text,
  sale_order_id     uuid references public.sale_orders (id) on delete set null,
  assign_to         text,
  user_id           uuid references public.users (id) on delete set null,
  is_khr            boolean,
  inv_value         numeric,
  status            integer,
  payment_term      text,
  remarks           text,
  shipment_mark     text,
  order_type        text,
  dl_req            boolean,
  dl_status         integer,
  number_of_ctn     numeric,
  packed_date       date,
  sent_date         date,
  received_date     date,
  truck_id          text,
  dl_note           text,
  sheet_created_by  text,
  sheet_created_at  timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create unique index invoices_sheet_id_key on public.invoices (sheet_id) where sheet_id is not null;
create index invoices_user_id_inv_date_idx on public.invoices (user_id, inv_date desc);
create index invoices_customer_id_idx on public.invoices (customer_id);
create index invoices_inv_no_idx on public.invoices (inv_no);

comment on column public.invoices.sheet_id is 'The invoice''s ID in the INV tab (its unique key).';
comment on column public.invoices.status is 'STATUS from the sheet: 0 draft, 5 submitted, 9 void. All are imported.';
comment on column public.invoices.payment_term is 'PAYMENT_TERM from the sheet: a payment_terms.sheet_id.';
comment on column public.invoices.assign_to is 'ASSIGN_TO as written in the sheet; user_id is the user whose Google Sheet ID it names.';
comment on column public.invoices.inv_value is 'INV_VALUE as in the sheet (USD, or riel when is_khr).';

create trigger invoices_set_updated_at
  before update on public.invoices
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- links

-- The user an ASSIGN_TO cell names: the first comma-separated ID in it that a Super Admin
-- set for an ACTIVE user (user_sheet_ids; IDs are stored lower-case and trimmed).
create function app.sheet_user(p_cell text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.user_id
    from unnest(string_to_array(lower(coalesce(p_cell, '')), ',')) with ordinality as t(id, n)
    join public.user_sheet_ids s on s.sheet_id = btrim(t.id)
    join public.users u on u.id = s.user_id and u.status = 'active'
   order by t.n
   limit 1;
$$;

create function app.invoices_resolve_links()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.user_id := app.sheet_user(new.assign_to);
  new.customer_id := (select c.id from public.customers c where c.sheet_id = new.customer_sheet_id);
  new.sale_order_id := (select o.id from public.sale_orders o where o.sheet_id = new.so_sheet_id);
  return new;
end;
$$;

create trigger invoices_resolve_links
  before insert or update of assign_to, customer_sheet_id, so_sheet_id on public.invoices
  for each row execute function app.invoices_resolve_links();

-- Make the links of every invoice again (a customer, order or user ID that arrived after
-- the invoice). Returns how many invoices changed.
create function app.invoices_relink()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_changed integer;
begin
  with new_links as (
    select i.id,
           app.sheet_user(i.assign_to) as user_id,
           (select c.id from public.customers c where c.sheet_id = i.customer_sheet_id) as customer_id,
           (select o.id from public.sale_orders o where o.sheet_id = i.so_sheet_id) as sale_order_id
      from public.invoices i
  ), up as (
    update public.invoices i
       set user_id = n.user_id, customer_id = n.customer_id, sale_order_id = n.sale_order_id
      from new_links n
     where n.id = i.id
       and (i.user_id, i.customer_id, i.sale_order_id) is distinct from (n.user_id, n.customer_id, n.sale_order_id)
    returning 1
  )
  select count(*)::integer into v_changed from up;
  return v_changed;
end;
$$;

create function public.invoices_relink()
returns integer language sql security definer set search_path = ''
as $$ select app.invoices_relink(); $$;

revoke execute on function app.sheet_user(text) from public;
revoke execute on function app.invoices_resolve_links() from public;
revoke execute on function app.invoices_relink() from public;
revoke execute on function public.invoices_relink() from public, anon, authenticated;
grant execute on function app.sheet_user(text) to service_role;
grant execute on function app.invoices_relink() to service_role;
grant execute on function public.invoices_relink() to service_role;

-- ---------------------------------------------------------------- reading

alter table public.payment_terms enable row level security;
alter table public.invoices enable row level security;

create policy payment_terms_select on public.payment_terms
  for select to authenticated
  using (app.can('invoice', 'view'));

create policy invoices_select on public.invoices
  for select to authenticated
  using (app.can('invoice', 'view', user_id));

revoke all on public.payment_terms, public.invoices from anon;
grant select on public.payment_terms, public.invoices to authenticated;

-- Invoices with the due date worked out from the payment term. Runs with the caller's
-- rights, so the invoice policy above applies.
create view public.invoice_details with (security_invoker = true) as
select i.*,
       t.due_days,
       case when i.inv_date is not null and t.due_days is not null then i.inv_date + t.due_days end as due_date
  from public.invoices i
  left join public.payment_terms t on t.sheet_id = i.payment_term;

grant select on public.invoice_details to authenticated;

-- ---------------------------------------------------------------- sync

insert into public.sync_targets (table_name, label, key_column, conflict_target, blocked_columns, sort_order, pk_column) values
  ('payment_terms', 'Payment terms', 'sheet_id', '(sheet_id) where sheet_id is not null', array['id', 'created_at', 'updated_at'], 12, 'id'),
  ('invoices', 'Invoices', 'sheet_id', '(sheet_id) where sheet_id is not null', array['id', 'created_at', 'updated_at', 'user_id', 'customer_id', 'sale_order_id'], 13, 'id');

-- How a sheet writes its dates; null uses sheet_sync_settings.date_order.
alter table public.sync_sources
  add column date_order text check (date_order in ('dmy', 'mdy'));
comment on column public.sync_sources.date_order is 'dmy or mdy: how this sheet writes dates; null = the global setting (sheet_sync_settings.date_order).';
