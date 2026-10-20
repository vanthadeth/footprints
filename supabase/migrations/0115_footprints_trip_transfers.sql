-- Footprints: Sales trips -- accountant view + allowance transfer mark.
--
-- The accounting role sees requested (pending) and approved trips and, once a
-- trip is approved, marks its allowance as transferred. Approving stays
-- sales_trip.edit; transferring is its own module so the two never mix.

-- ---------------------------------------------------------------- columns

alter table public.sales_trips
  add column transferred_at timestamptz,
  add column transferred_by uuid references public.users(id),
  add column transfer_ref   text;

comment on column public.sales_trips.transferred_at is 'When the accountant transferred the trip allowance; null until then. Only approved trips can be marked.';
comment on column public.sales_trips.transferred_by is 'The accountant who marked the allowance transferred.';
comment on column public.sales_trips.transfer_ref is 'Optional bank reference or note typed by the accountant.';

-- ---------------------------------------------------------------- module + grants

insert into public.modules (key, name, icon, href, sort_order, active, group_name) values
  ('sales_trip_transfer', 'Trip allowance transfer', 'map', 'approvals', 23, true, 'People');

insert into public.role_permissions (role_id, module_key, action, scope)
select r.id, v.module_key, v.action::public.permission_action, 'any'::public.permission_scope
  from public.roles r
 cross join (values ('sales_trip', 'view'), ('sales_trip_transfer', 'edit')) v(module_key, action)
 where r.key = 'accounting';

-- ---------------------------------------------------------------- mark transferred

create function app.mark_sales_trip_transferred(p_id uuid, p_ref text default null)
returns public.sales_trips
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_me  uuid := auth.uid();
  v_row public.sales_trips;
begin
  select * into v_row from public.sales_trips where id = p_id for update;
  if not found then
    raise exception 'not_found';
  end if;
  if not app.can('sales_trip_transfer', 'edit', v_row.user_id) then
    raise exception 'insufficient_privilege' using errcode = 'insufficient_privilege', detail = 'Only the accountant can transfer trip allowances.';
  end if;
  if v_row.status <> 'approved' then
    raise exception 'invalid_state' using detail = 'Only an approved trip can be transferred.';
  end if;
  if v_row.transferred_at is not null then
    raise exception 'invalid_state' using detail = 'This trip has already been marked as transferred.';
  end if;

  update public.sales_trips
     set transferred_at = now(), transferred_by = v_me, transfer_ref = nullif(btrim(p_ref), ''), updated_at = now()
   where id = p_id
   returning * into v_row;
  return v_row;
end;
$function$;

comment on function app.mark_sales_trip_transferred is
  'Accountant marks an approved trip''s allowance as transferred (once), with an optional reference.';

create function public.mark_sales_trip_transferred(p_id uuid, p_ref text default null)
returns public.sales_trips language sql set search_path to ''
as $function$ select * from app.mark_sales_trip_transferred(p_id, p_ref); $function$;

revoke execute on function app.mark_sales_trip_transferred(uuid, text) from public;
revoke execute on function public.mark_sales_trip_transferred(uuid, text) from public;
grant execute on function app.mark_sales_trip_transferred(uuid, text) to authenticated;
grant execute on function public.mark_sales_trip_transferred(uuid, text) to authenticated;

-- ---------------------------------------------------------------- reads

-- sales_trips() JSON carries the transfer fields and can_transfer, and gains a
-- 'ledger' mode: pending + approved trips of anyone I can view (the accountant's list).
do $do$
declare
  v_def text := pg_get_functiondef('app.sales_trips(text)'::regprocedure);
  v_old1 text := $old$'created_at', t.created_at,$old$;
  v_new1 text := $new$'created_at', t.created_at,
      'transferred_at', t.transferred_at, 'transferred_by', coalesce(nullif(btrim(tu.nickname), ''), tu.full_name), 'transfer_ref', t.transfer_ref,
      'can_transfer', t.status = 'approved' and t.transferred_at is null and app.can('sales_trip_transfer', 'edit', t.user_id),$new$;
  v_old2 text := $old$left join public.users du on du.id = t.decided_by$old$;
  v_new2 text := $new$left join public.users du on du.id = t.decided_by
    left join public.users tu on tu.id = t.transferred_by$new$;
  v_old3 text := $old$where case when p_mode = 'team'$old$;
  v_new3 text := $new$where case when p_mode = 'ledger'
               then t.status in ('pending', 'approved') and app.can('sales_trip', 'view', t.user_id)
               when p_mode = 'team'$new$;
begin
  if position(v_old1 in v_def) = 0 or position(v_old2 in v_def) = 0 or position(v_old3 in v_def) = 0 then
    raise exception 'sales_trips has changed; transfer fields not added';
  end if;
  execute replace(replace(replace(v_def, v_old1, v_new1), v_old2, v_new2), v_old3, v_new3);
end
$do$;

comment on function app.sales_trips is
  'Trips with days, people and special lines as JSON. mine = sent by me or I''m on it; team = trips I can view as an approver; ledger = pending and approved trips I can view (accountant).';
