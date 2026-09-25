-- Footprints: visit outcome -- order value and cash collected.
--
-- "Order value only": a rep records how much the customer ordered and how
-- much they collected on the visit itself, without product lines. The
-- existing sale_orders/items tables stay untouched.
--
-- app._close_visit is NOT changed (auto-checkout in 0077 calls it with named
-- args). app.check_out closes the visit through it as before, then stamps
-- the two amounts on the row it just closed. check_out and
-- update_visit_record stay security invoker, relying on the visits RLS
-- exactly as before; only their signatures grow two trailing defaulted
-- params, so the old overloads are dropped to keep PostgREST unambiguous.

alter table public.visits
  add column order_amount_usd numeric(12,2) check (order_amount_usd >= 0),
  add column collected_usd numeric(12,2) check (collected_usd >= 0);

comment on column public.visits.order_amount_usd is 'Order value (USD) the rep recorded at check-out. Null = not recorded.';
comment on column public.visits.collected_usd is 'Cash/transfer collected (USD) on this visit. Null = not recorded.';

drop function if exists public.check_out(uuid, numeric, numeric, numeric, uuid, uuid, uuid, uuid, timestamptz, text);
drop function if exists app.check_out(uuid, numeric, numeric, numeric, uuid, uuid, uuid, uuid, timestamptz, text);
drop function if exists public.update_visit_record(uuid, uuid, uuid, uuid, uuid, timestamptz, text);
drop function if exists app.update_visit_record(uuid, uuid, uuid, uuid, uuid, timestamptz, text);

create function app.check_out(
  p_visit uuid,
  p_latitude numeric,
  p_longitude numeric,
  p_accuracy numeric default null,
  p_visit_type_id uuid default null,
  p_visit_status_id uuid default null,
  p_order_status_id uuid default null,
  p_payment_status_id uuid default null,
  p_next_appointment timestamptz default null,
  p_remarks text default null,
  p_order_amount_usd numeric default null,
  p_collected_usd numeric default null
)
returns public.visits
language plpgsql
set search_path = ''
as $$
declare
  v_visit public.visits;
begin
  if not app.within_check_window() then
    raise exception 'Check-out is only allowed between 7:00 AM and 8:00 PM.'
      using errcode = 'check_violation';
  end if;

  select * into v_visit from app._close_visit(
    p_visit, p_latitude, p_longitude, p_accuracy, null,
    p_visit_type_id, p_visit_status_id, p_order_status_id, p_payment_status_id,
    p_next_appointment, p_remarks
  );

  if v_visit.id is null then
    raise exception 'That visit is not open' using errcode = 'no_data_found';
  end if;

  if p_order_amount_usd is not null or p_collected_usd is not null then
    update public.visits
       set order_amount_usd = coalesce(p_order_amount_usd, order_amount_usd),
           collected_usd = coalesce(p_collected_usd, collected_usd)
     where id = v_visit.id
    returning * into v_visit;
  end if;

  return v_visit;
end;
$$;

create function public.check_out(
  p_visit uuid,
  p_latitude numeric,
  p_longitude numeric,
  p_accuracy numeric default null,
  p_visit_type_id uuid default null,
  p_visit_status_id uuid default null,
  p_order_status_id uuid default null,
  p_payment_status_id uuid default null,
  p_next_appointment timestamptz default null,
  p_remarks text default null,
  p_order_amount_usd numeric default null,
  p_collected_usd numeric default null
)
returns public.visits
language sql
set search_path = ''
as $$
  select app.check_out(
    p_visit, p_latitude, p_longitude, p_accuracy,
    p_visit_type_id, p_visit_status_id, p_order_status_id, p_payment_status_id,
    p_next_appointment, p_remarks, p_order_amount_usd, p_collected_usd
  );
$$;

create function app.update_visit_record(
  p_visit uuid,
  p_visit_type_id uuid default null,
  p_visit_status_id uuid default null,
  p_order_status_id uuid default null,
  p_payment_status_id uuid default null,
  p_next_appointment timestamptz default null,
  p_remarks text default null,
  p_order_amount_usd numeric default null,
  p_collected_usd numeric default null
)
returns public.visits
language plpgsql
set search_path = ''
as $$
declare
  v_visit public.visits;
begin
  select * into v_visit
    from public.visits
   where id = p_visit
     and user_id = auth.uid()
     and cancelled_at is null;

  if v_visit.id is null then
    raise exception 'No such visit' using errcode = 'no_data_found';
  end if;

  if v_visit.checked_in_at < now() - interval '24 hours' then
    raise exception 'This visit can no longer be edited -- the 24-hour edit window has passed.'
      using errcode = 'check_violation';
  end if;

  update public.visits
     set visit_type_id = p_visit_type_id,
         visit_status_id = p_visit_status_id,
         order_status_id = p_order_status_id,
         payment_status_id = p_payment_status_id,
         next_appointment = p_next_appointment,
         remarks = nullif(btrim(coalesce(p_remarks, '')), ''),
         order_amount_usd = p_order_amount_usd,
         collected_usd = p_collected_usd
   where id = p_visit
  returning * into v_visit;

  return v_visit;
end;
$$;

create function public.update_visit_record(
  p_visit uuid,
  p_visit_type_id uuid default null,
  p_visit_status_id uuid default null,
  p_order_status_id uuid default null,
  p_payment_status_id uuid default null,
  p_next_appointment timestamptz default null,
  p_remarks text default null,
  p_order_amount_usd numeric default null,
  p_collected_usd numeric default null
)
returns public.visits
language sql
set search_path = ''
as $$
  select app.update_visit_record(
    p_visit, p_visit_type_id, p_visit_status_id, p_order_status_id, p_payment_status_id,
    p_next_appointment, p_remarks, p_order_amount_usd, p_collected_usd
  );
$$;

revoke execute on function public.check_out(uuid, numeric, numeric, numeric, uuid, uuid, uuid, uuid, timestamptz, text, numeric, numeric) from public;
revoke execute on function public.update_visit_record(uuid, uuid, uuid, uuid, uuid, timestamptz, text, numeric, numeric) from public;
grant execute on function public.check_out(uuid, numeric, numeric, numeric, uuid, uuid, uuid, uuid, timestamptz, text, numeric, numeric) to authenticated;
grant execute on function public.update_visit_record(uuid, uuid, uuid, uuid, uuid, timestamptz, text, numeric, numeric) to authenticated;
grant execute on function app.check_out(uuid, numeric, numeric, numeric, uuid, uuid, uuid, uuid, timestamptz, text, numeric, numeric) to authenticated;
grant execute on function app.update_visit_record(uuid, uuid, uuid, uuid, uuid, timestamptz, text, numeric, numeric) to authenticated;
