-- Footprints: Today's plan -- an ordered list of customers a rep intends to
-- visit on a given day.
--
-- Items come from three places:
--   'appointment' -- lazily created by app.my_plan from the rep's own visits
--                    whose next_appointment falls on that (Phnom Penh) day
--   'manual'      -- added by the rep (app.plan_add)
--   'suggested'   -- added by the rep from the "overdue nearby" list
-- An item turns 'done' by itself once the rep checks in at that customer on
-- that day (app.my_plan links the visit). Removing an 'appointment' item
-- marks it 'removed' instead of deleting it, so the lazy insert doesn't
-- bring it straight back.
--
-- app.my_plan is security definer for the same reason as
-- app.customer_coverage (0087): "last visit" has to count any rep's visit.
-- It only ever reads/writes the caller's own items (user_id = auth.uid())
-- and applies the customer view rule via app.can(). The small write RPCs
-- are security invoker and rely on the RLS below.

create table public.visit_plan_items (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references public.users(id) on delete cascade,
  plan_date   date not null,
  customer_id uuid not null references public.customers(id) on delete cascade,
  sort_order  integer not null default 0,
  source      text not null default 'manual' check (source in ('manual', 'appointment', 'suggested')),
  status      text not null default 'planned' check (status in ('planned', 'done', 'skipped', 'removed')),
  visit_id    uuid references public.visits(id) on delete set null,
  created_at  timestamptz not null default now(),
  constraint visit_plan_items_unique unique (user_id, plan_date, customer_id)
);

comment on table public.visit_plan_items is
  'A rep''s planned stops for a day (Today''s plan). Read via app.my_plan; written via app.plan_add/plan_remove/plan_skip/plan_reorder.';

create index visit_plan_items_customer_id_idx on public.visit_plan_items (customer_id);
create index visit_plan_items_visit_id_idx on public.visit_plan_items (visit_id);

alter table public.visit_plan_items enable row level security;

create policy visit_plan_items_select on public.visit_plan_items
  for select to authenticated
  using (app.can('visit', 'view', user_id));

create policy visit_plan_items_insert on public.visit_plan_items
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy visit_plan_items_update on public.visit_plan_items
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy visit_plan_items_delete on public.visit_plan_items
  for delete to authenticated
  using (user_id = (select auth.uid()));

grant select, insert, update, delete on public.visit_plan_items to authenticated;

create function app.my_plan(p_date date default null)
returns table (
  item_id        uuid,
  customer_id    uuid,
  shop_name      text,
  address        text,
  latitude       numeric,
  longitude      numeric,
  tier           text,
  sort_order     integer,
  source         text,
  status         text,
  visit_id       uuid,
  checked_in_at  timestamptz,
  checked_out_at timestamptz,
  appointment_at timestamptz,
  last_visit_at  timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_me   uuid := auth.uid();
  v_date date := coalesce(p_date, (now() at time zone 'Asia/Phnom_Penh')::date);
  v_max  integer;
begin
  if v_me is null then
    raise exception 'Not signed in' using errcode = 'insufficient_privilege';
  end if;

  select coalesce(max(i.sort_order), 0) into v_max
    from public.visit_plan_items i
   where i.user_id = v_me and i.plan_date = v_date;

  insert into public.visit_plan_items (user_id, plan_date, customer_id, sort_order, source)
  select v_me, v_date, a.customer_id, v_max + row_number() over (order by a.appt), 'appointment'
    from (
      select distinct on (v.customer_id) v.customer_id, v.next_appointment as appt
        from public.visits v
       where v.user_id = v_me
         and v.cancelled_at is null
         and v.customer_id is not null
         and (v.next_appointment at time zone 'Asia/Phnom_Penh')::date = v_date
       order by v.customer_id, v.next_appointment
    ) a
  on conflict on constraint visit_plan_items_unique do nothing;

  update public.visit_plan_items i
     set status = 'done', visit_id = x.id
    from (
      select distinct on (v.customer_id) v.id, v.customer_id
        from public.visits v
       where v.user_id = v_me
         and v.cancelled_at is null
         and v.customer_id is not null
         and (v.checked_in_at at time zone 'Asia/Phnom_Penh')::date = v_date
       order by v.customer_id, v.checked_in_at desc
    ) x
   where i.user_id = v_me
     and i.plan_date = v_date
     and i.customer_id = x.customer_id
     and i.status in ('planned', 'skipped');

  return query
  select i.id,
         i.customer_id,
         c.shop_name,
         nullif(concat_ws(', ', nullif(c.street_address, ''), nullif(c.commune_text, ''), nullif(c.district_text, ''), nullif(c.province_text, '')), ''),
         c.latitude,
         c.longitude,
         coalesce(t.tier, 'B'),
         i.sort_order,
         i.source,
         i.status,
         i.visit_id,
         pv.checked_in_at,
         pv.checked_out_at,
         (select min(a.next_appointment)
            from public.visits a
           where a.user_id = v_me
             and a.customer_id = i.customer_id
             and a.cancelled_at is null
             and (a.next_appointment at time zone 'Asia/Phnom_Penh')::date = v_date),
         (select max(lv.checked_in_at)
            from public.visits lv
           where lv.customer_id = i.customer_id
             and lv.cancelled_at is null
             and (lv.checked_in_at at time zone 'Asia/Phnom_Penh')::date < v_date)
    from public.visit_plan_items i
    join public.customers c on c.id = i.customer_id
    left join public.customer_tiers t on t.customer_id = i.customer_id
    left join public.visits pv on pv.id = i.visit_id
   where i.user_id = v_me
     and i.plan_date = v_date
     and i.status <> 'removed'
     and app.can('customer', 'view', c.owner_id)
   order by i.sort_order, i.created_at;
end;
$$;

create function public.my_plan(p_date date default null)
returns table (
  item_id        uuid,
  customer_id    uuid,
  shop_name      text,
  address        text,
  latitude       numeric,
  longitude      numeric,
  tier           text,
  sort_order     integer,
  source         text,
  status         text,
  visit_id       uuid,
  checked_in_at  timestamptz,
  checked_out_at timestamptz,
  appointment_at timestamptz,
  last_visit_at  timestamptz
)
language sql
set search_path = ''
as $$
  select * from app.my_plan(p_date);
$$;

create function app.plan_add(p_date date, p_customer uuid, p_source text default 'manual')
returns public.visit_plan_items
language plpgsql
set search_path = ''
as $$
declare
  v_row public.visit_plan_items;
begin
  -- Invoker: this only finds customers the caller can view (customers RLS).
  if not exists (select 1 from public.customers c where c.id = p_customer) then
    raise exception 'No such customer' using errcode = 'no_data_found';
  end if;

  insert into public.visit_plan_items (user_id, plan_date, customer_id, sort_order, source)
  values (
    auth.uid(),
    p_date,
    p_customer,
    coalesce((select max(i.sort_order) from public.visit_plan_items i
               where i.user_id = auth.uid() and i.plan_date = p_date), 0) + 1,
    case when p_source in ('manual', 'suggested') then p_source else 'manual' end
  )
  on conflict on constraint visit_plan_items_unique
  do update set status = case when public.visit_plan_items.status = 'done' then 'done' else 'planned' end
  returning * into v_row;

  return v_row;
end;
$$;

create function public.plan_add(p_date date, p_customer uuid, p_source text default 'manual')
returns public.visit_plan_items
language sql
set search_path = ''
as $$
  select app.plan_add(p_date, p_customer, p_source);
$$;

create function app.plan_remove(p_item uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  update public.visit_plan_items
     set status = 'removed'
   where id = p_item and user_id = auth.uid() and source = 'appointment';

  delete from public.visit_plan_items
   where id = p_item and user_id = auth.uid() and source <> 'appointment';
end;
$$;

create function public.plan_remove(p_item uuid)
returns void
language sql
set search_path = ''
as $$
  select app.plan_remove(p_item);
$$;

create function app.plan_skip(p_item uuid, p_skipped boolean default true)
returns public.visit_plan_items
language sql
set search_path = ''
as $$
  update public.visit_plan_items
     set status = case when p_skipped then 'skipped' else 'planned' end
   where id = p_item and user_id = auth.uid() and status in ('planned', 'skipped')
  returning *;
$$;

create function public.plan_skip(p_item uuid, p_skipped boolean default true)
returns public.visit_plan_items
language sql
set search_path = ''
as $$
  select app.plan_skip(p_item, p_skipped);
$$;

create function app.plan_reorder(p_date date, p_ids uuid[])
returns void
language sql
set search_path = ''
as $$
  update public.visit_plan_items i
     set sort_order = o.ord
    from unnest(p_ids) with ordinality as o(id, ord)
   where i.id = o.id and i.user_id = auth.uid() and i.plan_date = p_date;
$$;

create function public.plan_reorder(p_date date, p_ids uuid[])
returns void
language sql
set search_path = ''
as $$
  select app.plan_reorder(p_date, p_ids);
$$;

revoke execute on function app.my_plan(date) from public;
revoke execute on function public.my_plan(date) from public;
revoke execute on function app.plan_add(date, uuid, text) from public;
revoke execute on function public.plan_add(date, uuid, text) from public;
revoke execute on function app.plan_remove(uuid) from public;
revoke execute on function public.plan_remove(uuid) from public;
revoke execute on function app.plan_skip(uuid, boolean) from public;
revoke execute on function public.plan_skip(uuid, boolean) from public;
revoke execute on function app.plan_reorder(date, uuid[]) from public;
revoke execute on function public.plan_reorder(date, uuid[]) from public;

grant execute on function app.my_plan(date) to authenticated;
grant execute on function public.my_plan(date) to authenticated;
grant execute on function app.plan_add(date, uuid, text) to authenticated;
grant execute on function public.plan_add(date, uuid, text) to authenticated;
grant execute on function app.plan_remove(uuid) to authenticated;
grant execute on function public.plan_remove(uuid) to authenticated;
grant execute on function app.plan_skip(uuid, boolean) to authenticated;
grant execute on function public.plan_skip(uuid, boolean) to authenticated;
grant execute on function app.plan_reorder(date, uuid[]) to authenticated;
grant execute on function public.plan_reorder(date, uuid[]) to authenticated;
