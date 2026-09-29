-- Footprints: the customer book -- list, briefing and visit activity.
--
-- The Customers list, Customer detail and Customer briefing all show
-- "N days since the last visit, by whom", visits in 90 days, visit
-- frequency and the last outcome, counting EVERY rep's visits. Sales Team
-- can only read their own visits under RLS, so -- like customer_coverage
-- (0087) -- these are security definer functions that apply the customer
-- view rule themselves via app.can().
--
-- Everything is filtered and paged in the database so the app never loads
-- all ~2,000 customers (PostgREST also cuts responses off at 1,000 rows):
--   customer_book_summary  -- counts per province x last-visit bucket
--   customer_book          -- one page of customers, sorted
--   customer_visit_activity-- everyone's visits to one customer
--   customer_visitors      -- people for the "Visited by" filter
--
-- Last-visit buckets: '0-14', '15-30', '31-60', '60+' days, or 'never'.
-- The people filter: visited (or, with p_mode = 'not', not visited) by any
-- of p_people -- anyone when empty -- within the last p_months months.
--
-- Also adds the customer_briefing module (the managers' briefing table),
-- granted to Sale Manager, Sale Supervisor, Sale Admin and System Admin.

-- ---------------------------------------------------------------- module

insert into public.modules (key, name, icon, href, sort_order, active, group_name) values
  ('customer_briefing', 'Customer briefing', 'table', 'team/customers', 21, true, 'People');

insert into public.role_permissions (role_id, module_key, action, scope)
select r.id, 'customer_briefing', 'view'::public.permission_action, 'any'::public.permission_scope
  from public.roles r
 where r.key in ('sales_manager', 'sales_supervisor', 'sale_admin', 'system_admin');

-- ---------------------------------------------------------------- base

-- Every viewable customer that passes search / owner / people, with its
-- visit stats. Not granted to anyone: the two book functions read it.
create function app.customer_book_base(
  p_search text default null,
  p_owner uuid default null,
  p_people uuid[] default null,
  p_mode text default 'visited',
  p_months integer default 3,
  p_lat numeric default null,
  p_lng numeric default null
)
returns table (
  customer_id       uuid,
  shop_name         text,
  code              text,
  district          text,
  province_code     text,
  province_name     text,
  owner_id          uuid,
  owner_name        text,
  owner_nickname    text,
  latitude          numeric,
  longitude         numeric,
  last_visit_at     timestamptz,
  days_since        integer,
  last_by_id        uuid,
  last_by_name      text,
  last_by_nickname  text,
  visits_90         integer,
  freq_days         integer,
  last_visit_status text,
  last_order_status text,
  last_amount       numeric,
  last_payment      text,
  last_collected    numeric,
  next_visit        date,
  bucket            text,
  distance_m        integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select (now() at time zone 'Asia/Phnom_Penh')::date as today,
           btrim(coalesce(p_search, '')) as q,
           regexp_replace(coalesce(p_search, ''), '\D', '', 'g') as digits,
           (coalesce(p_mode, 'visited') = 'not' or cardinality(coalesce(p_people, '{}'::uuid[])) > 0) as people_on,
           now() - make_interval(months => greatest(coalesce(p_months, 3), 1)) as since
  ),
  v as (
    select x.customer_id, x.user_id, x.checked_in_at,
           (x.checked_in_at at time zone 'Asia/Phnom_Penh')::date as day,
           x.visit_status_id, x.order_status_id, x.payment_status_id,
           x.order_amount_usd, x.collected_usd, x.next_appointment
      from public.visits x
     where x.cancelled_at is null and x.customer_id is not null
  ),
  agg as (
    select v.customer_id,
           count(*) filter (where v.day >= (select today from me) - 90) as n90,
           min(v.day) filter (where v.day >= (select today from me) - 90) as first90,
           max(v.day) filter (where v.day >= (select today from me) - 90) as last90,
           min((v.next_appointment at time zone 'Asia/Phnom_Penh')::date)
             filter (where (v.next_appointment at time zone 'Asia/Phnom_Penh')::date >= (select today from me)) as next_appt
      from v
     group by v.customer_id
  ),
  lastv as (
    select distinct on (v.customer_id) v.*
      from v
     order by v.customer_id, v.checked_in_at desc
  ),
  planned as (
    select i.customer_id, min(i.plan_date) as plan_date
      from public.visit_plan_items i
     where i.status = 'planned' and i.plan_date >= (select today from me)
     group by i.customer_id
  ),
  base as (
    select c.id, c.shop_name, c.code, c.district_text,
           coalesce(c.province_code, 'none') as prov_code,
           coalesce(gp.name, nullif(c.province_text, ''), 'No province') as prov_name,
           c.owner_id, ou.full_name as owner_name, ou.nickname as owner_nickname,
           c.latitude, c.longitude,
           lv.checked_in_at as last_at,
           (select today from me) - lv.day as days,
           lv.user_id as by_id, bu.full_name as by_name, bu.nickname as by_nickname,
           coalesce(a.n90, 0)::integer as n90,
           case when a.n90 >= 2 then greatest(1, round((a.last90 - a.first90)::numeric / (a.n90 - 1)))::integer end as freq,
           vs.label as vs_label, os.label as os_label, lv.order_amount_usd, ps.label as ps_label, lv.collected_usd,
           least(a.next_appt, pl.plan_date) as next_on
      from public.customers c
      left join public.geo_provinces gp on gp.code = c.province_code
      left join public.users ou on ou.id = c.owner_id
      left join agg a on a.customer_id = c.id
      left join lastv lv on lv.customer_id = c.id
      left join public.users bu on bu.id = lv.user_id
      left join public.visit_options vs on vs.id = lv.visit_status_id
      left join public.visit_options os on os.id = lv.order_status_id
      left join public.visit_options ps on ps.id = lv.payment_status_id
      left join planned pl on pl.customer_id = c.id
     where app.can('customer', 'view', c.owner_id)
       and (p_owner is null or c.owner_id = p_owner)
       and (
         (select q from me) = ''
         or c.shop_name ilike '%' || (select q from me) || '%'
         or c.code ilike '%' || (select q from me) || '%'
         or c.district_text ilike '%' || (select q from me) || '%'
         or (length((select digits from me)) >= 3 and exists (
               select 1 from public.customer_contacts ct
                where ct.customer_id = c.id and ct.active
                  and regexp_replace(coalesce(ct.phone, ''), '\D', '', 'g') like '%' || (select digits from me) || '%'))
       )
       and (
         not (select people_on from me)
         or (coalesce(p_mode, 'visited') = 'not') <> exists (
               select 1 from public.visits pv
                where pv.customer_id = c.id and pv.cancelled_at is null
                  and pv.checked_in_at >= (select since from me)
                  and (cardinality(coalesce(p_people, '{}'::uuid[])) = 0 or pv.user_id = any(p_people)))
       )
  )
  select b.id, b.shop_name, b.code, b.district_text, b.prov_code, b.prov_name,
         b.owner_id, b.owner_name, b.owner_nickname, b.latitude, b.longitude,
         b.last_at, b.days, b.by_id, b.by_name, b.by_nickname, b.n90, b.freq,
         b.vs_label, b.os_label, b.order_amount_usd, b.ps_label, b.collected_usd, b.next_on,
         case
           when b.last_at is null then 'never'
           when b.days <= 14 then '0-14'
           when b.days <= 30 then '15-30'
           when b.days <= 60 then '31-60'
           else '60+'
         end,
         case
           when p_lat is not null and p_lng is not null and b.latitude is not null and b.longitude is not null
             then round(app.metres_between(p_lat, p_lng, b.latitude, b.longitude))::integer
         end
    from base b;
$$;

-- ---------------------------------------------------------------- summary

create function app.customer_book_summary(
  p_search text default null,
  p_owner uuid default null,
  p_people uuid[] default null,
  p_mode text default 'visited',
  p_months integer default 3
)
returns table (province_code text, province_name text, bucket text, n integer)
language sql
stable
security definer
set search_path = ''
as $$
  select b.province_code, b.province_name, b.bucket, count(*)::integer
    from app.customer_book_base(p_search, p_owner, p_people, p_mode, p_months) b
   group by b.province_code, b.province_name, b.bucket;
$$;

create function public.customer_book_summary(
  p_search text default null,
  p_owner uuid default null,
  p_people uuid[] default null,
  p_mode text default 'visited',
  p_months integer default 3
)
returns table (province_code text, province_name text, bucket text, n integer)
language sql
stable
set search_path = ''
as $$
  select * from app.customer_book_summary(p_search, p_owner, p_people, p_mode, p_months);
$$;

-- ---------------------------------------------------------------- page

-- p_sort: last (default; longest since the last visit first, never visited
-- on top), name, owner, visits, freq, next, distance (needs p_lat/p_lng;
-- customers without a pin are left out). p_desc null = the sort's default.
create function app.customer_book(
  p_search text default null,
  p_province text default null,
  p_ranges text[] default null,
  p_people uuid[] default null,
  p_mode text default 'visited',
  p_months integer default 3,
  p_owner uuid default null,
  p_sort text default 'last',
  p_desc boolean default null,
  p_lat numeric default null,
  p_lng numeric default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  customer_id       uuid,
  shop_name         text,
  code              text,
  district          text,
  province_code     text,
  province_name     text,
  owner_id          uuid,
  owner_name        text,
  owner_nickname    text,
  last_visit_at     timestamptz,
  days_since        integer,
  last_by_id        uuid,
  last_by_name      text,
  last_by_nickname  text,
  visits_90         integer,
  freq_days         integer,
  last_visit_status text,
  last_order_status text,
  last_amount       numeric,
  last_payment      text,
  last_collected    numeric,
  next_visit        date,
  bucket            text,
  distance_m        integer,
  total_count       integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with opts as (
    select coalesce(p_sort, 'last') as s,
           coalesce(p_desc, coalesce(p_sort, 'last') in ('last', 'visits')) as d,
           (now() at time zone 'Asia/Phnom_Penh')::date as today
  ),
  rows as (
    select b.*,
           case (select s from opts)
             when 'last' then coalesce(b.days_since, 100000)
             when 'visits' then b.visits_90
             when 'freq' then coalesce(b.freq_days, 100000)
             when 'next' then coalesce(b.next_visit - (select today from opts), 100000)
             when 'distance' then b.distance_m
           end as num_key,
           case (select s from opts)
             when 'name' then lower(b.shop_name)
             when 'owner' then lower(coalesce(nullif(b.owner_nickname, ''), b.owner_name, ''))
           end as text_key
      from app.customer_book_base(p_search, p_owner, p_people, p_mode, p_months, p_lat, p_lng) b
     where (p_province is null or b.province_code = p_province)
       and (cardinality(coalesce(p_ranges, '{}'::text[])) = 0 or b.bucket = any(p_ranges))
       and ((select s from opts) <> 'distance' or b.distance_m is not null)
  )
  select r.customer_id, r.shop_name, r.code, r.district, r.province_code, r.province_name,
         r.owner_id, r.owner_name, r.owner_nickname, r.last_visit_at, r.days_since,
         r.last_by_id, r.last_by_name, r.last_by_nickname, r.visits_90, r.freq_days,
         r.last_visit_status, r.last_order_status, r.last_amount, r.last_payment, r.last_collected,
         r.next_visit, r.bucket, r.distance_m,
         (count(*) over ())::integer
    from rows r
   order by
     case when (select d from opts) then r.num_key end desc nulls last,
     case when not (select d from opts) then r.num_key end asc nulls last,
     case when (select d from opts) then r.text_key end desc,
     case when not (select d from opts) then r.text_key end asc,
     lower(r.shop_name), r.customer_id
   limit least(greatest(coalesce(p_limit, 20), 1), 200)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

create function public.customer_book(
  p_search text default null,
  p_province text default null,
  p_ranges text[] default null,
  p_people uuid[] default null,
  p_mode text default 'visited',
  p_months integer default 3,
  p_owner uuid default null,
  p_sort text default 'last',
  p_desc boolean default null,
  p_lat numeric default null,
  p_lng numeric default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  customer_id       uuid,
  shop_name         text,
  code              text,
  district          text,
  province_code     text,
  province_name     text,
  owner_id          uuid,
  owner_name        text,
  owner_nickname    text,
  last_visit_at     timestamptz,
  days_since        integer,
  last_by_id        uuid,
  last_by_name      text,
  last_by_nickname  text,
  visits_90         integer,
  freq_days         integer,
  last_visit_status text,
  last_order_status text,
  last_amount       numeric,
  last_payment      text,
  last_collected    numeric,
  next_visit        date,
  bucket            text,
  distance_m        integer,
  total_count       integer
)
language sql
stable
set search_path = ''
as $$
  select * from app.customer_book(p_search, p_province, p_ranges, p_people, p_mode, p_months,
                                  p_owner, p_sort, p_desc, p_lat, p_lng, p_limit, p_offset);
$$;

-- ---------------------------------------------------------------- activity

-- Everyone's visits to one customer over the last year, newest first,
-- including voided (cancelled) ones so the history reads truthfully.
create function app.customer_visit_activity(p_customer uuid)
returns table (
  visit_id       uuid,
  checked_in_at  timestamptz,
  user_id        uuid,
  full_name      text,
  nickname       text,
  visit_status   text,
  order_status   text,
  payment_status text,
  order_amount   numeric,
  collected      numeric,
  remarks        text,
  next_visit     timestamptz,
  cancelled_at   timestamptz,
  cancel_reason  text
)
language sql
stable
security definer
set search_path = ''
as $$
  select v.id, v.checked_in_at, v.user_id, u.full_name, u.nickname,
         vs.label, os.label, ps.label, v.order_amount_usd, v.collected_usd, v.remarks,
         v.next_appointment, v.cancelled_at, v.cancel_reason
    from public.visits v
    join public.customers c on c.id = v.customer_id
    left join public.users u on u.id = v.user_id
    left join public.visit_options vs on vs.id = v.visit_status_id
    left join public.visit_options os on os.id = v.order_status_id
    left join public.visit_options ps on ps.id = v.payment_status_id
   where v.customer_id = p_customer
     and app.can('customer', 'view', c.owner_id)
     and v.checked_in_at >= now() - interval '365 days'
   order by v.checked_in_at desc
   limit 200;
$$;

create function public.customer_visit_activity(p_customer uuid)
returns table (
  visit_id       uuid,
  checked_in_at  timestamptz,
  user_id        uuid,
  full_name      text,
  nickname       text,
  visit_status   text,
  order_status   text,
  payment_status text,
  order_amount   numeric,
  collected      numeric,
  remarks        text,
  next_visit     timestamptz,
  cancelled_at   timestamptz,
  cancel_reason  text
)
language sql
stable
set search_path = ''
as $$
  select * from app.customer_visit_activity(p_customer);
$$;

-- ---------------------------------------------------------------- visitors

create function app.customer_visitors(p_months integer default 12)
returns table (user_id uuid, full_name text, nickname text, visits integer)
language sql
stable
security definer
set search_path = ''
as $$
  select v.user_id, u.full_name, u.nickname, count(*)::integer
    from public.visits v
    join public.users u on u.id = v.user_id
   where v.cancelled_at is null
     and v.checked_in_at >= now() - make_interval(months => greatest(coalesce(p_months, 12), 1))
     and app.can('customer', 'view', null)
   group by v.user_id, u.full_name, u.nickname
   order by count(*) desc, u.full_name;
$$;

create function public.customer_visitors(p_months integer default 12)
returns table (user_id uuid, full_name text, nickname text, visits integer)
language sql
stable
set search_path = ''
as $$
  select * from app.customer_visitors(p_months);
$$;

-- ---------------------------------------------------------------- grants

revoke execute on function app.customer_book_base(text, uuid, uuid[], text, integer, numeric, numeric) from public;
revoke execute on function app.customer_book_summary(text, uuid, uuid[], text, integer) from public;
revoke execute on function public.customer_book_summary(text, uuid, uuid[], text, integer) from public;
revoke execute on function app.customer_book(text, text, text[], uuid[], text, integer, uuid, text, boolean, numeric, numeric, integer, integer) from public;
revoke execute on function public.customer_book(text, text, text[], uuid[], text, integer, uuid, text, boolean, numeric, numeric, integer, integer) from public;
revoke execute on function app.customer_visit_activity(uuid) from public;
revoke execute on function public.customer_visit_activity(uuid) from public;
revoke execute on function app.customer_visitors(integer) from public;
revoke execute on function public.customer_visitors(integer) from public;

grant execute on function app.customer_book_summary(text, uuid, uuid[], text, integer) to authenticated;
grant execute on function public.customer_book_summary(text, uuid, uuid[], text, integer) to authenticated;
grant execute on function app.customer_book(text, text, text[], uuid[], text, integer, uuid, text, boolean, numeric, numeric, integer, integer) to authenticated;
grant execute on function public.customer_book(text, text, text[], uuid[], text, integer, uuid, text, boolean, numeric, numeric, integer, integer) to authenticated;
grant execute on function app.customer_visit_activity(uuid) to authenticated;
grant execute on function public.customer_visit_activity(uuid) to authenticated;
grant execute on function app.customer_visitors(integer) to authenticated;
grant execute on function public.customer_visitors(integer) to authenticated;
