-- Footprints: Permissions settings -- the admin screens for "by role",
-- "by person" and "who can", plus the pieces of the design that had no
-- enforcement yet.
--
--   * Three new permission modules the design switches on and off:
--     footprints (Use Footprints), plan (Today's plan), team_map (Team map).
--     Seeded to the design: field roles get Footprints/plan, managers get
--     the team map.
--   * Per-person overrides can expire (expires_at); app.effective_scope
--     ignores an expired one.
--   * Admins only: overrides are now written only by holders of the
--     role_permission module (Super Admin + System Admin role) -- before,
--     anyone with user:edit (HR) could grant themselves anything -- and a
--     person's role / super-admin flag can only be changed by an admin.
--   * Clock-in / clock-out location rules per role and per person
--     (clock_location_rules), enforced inside app.clock_in / app.clock_out.
--     None are seeded: everyone stays "anywhere" until an admin sets one.
--   * Write RPCs for the settings screens, and my_clock_rules() for the
--     Check In button. The app gates tabs on the existing my_permissions().

-- ---------------------------------------------------------------- modules

insert into public.modules (key, name, icon, href, sort_order, active, group_name) values
  ('footprints', 'Footprints', 'footprints', 'footprints', 18, true, 'Selling'),
  ('plan', 'Today''s plan', 'route', 'plan', 19, true, 'Selling'),
  ('team_map', 'Team map', 'map', 'fleet', 20, true, 'People');

insert into public.role_permissions (role_id, module_key, action, scope)
select r.id, v.module_key, 'view'::public.permission_action, v.scope::public.permission_scope
from public.roles r
join (values
  ('sales', 'footprints', 'own'), ('sales', 'plan', 'own'),
  ('sales_supervisor', 'footprints', 'own'), ('sales_supervisor', 'plan', 'own'), ('sales_supervisor', 'team_map', 'sub'),
  ('sales_manager', 'footprints', 'own'), ('sales_manager', 'plan', 'own'), ('sales_manager', 'team_map', 'any'),
  ('warehouse', 'footprints', 'own'), ('warehouse', 'plan', 'own'),
  ('hr', 'team_map', 'any'),
  ('system_admin', 'footprints', 'own'), ('system_admin', 'plan', 'own'), ('system_admin', 'team_map', 'any')
) as v(role_key, module_key, scope) on v.role_key = r.key;

-- ---------------------------------------------------------------- overrides

alter table public.user_permission_overrides
  add column expires_at timestamptz,
  add column updated_by uuid references public.users(id),
  add column updated_at timestamptz not null default now();

create or replace function app.effective_scope(p_user uuid, p_module text, p_action permission_action)
returns permission_scope
language plpgsql
stable security definer
set search_path to ''
as $function$
declare
  v_status  public.user_status;
  v_super   boolean;
  v_role_id uuid;
  v_scope   public.permission_scope;
begin
  if p_user is null then
    return null;
  end if;

  select u.status, u.is_super_admin, u.role_id
    into v_status, v_super, v_role_id
  from public.users u
  where u.id = p_user;

  if not found or v_status <> 'active' then
    return null;
  end if;

  if v_super then
    return 'any';
  end if;

  -- An override that has passed its expires_at no longer applies.
  select o.scope into v_scope
  from public.user_permission_overrides o
  where o.user_id = p_user and o.module_key = p_module and o.action = p_action
    and (o.expires_at is null or o.expires_at > now());

  if not found then
    select rp.scope into v_scope
    from public.role_permissions rp
    where rp.role_id = v_role_id and rp.module_key = p_module and rp.action = p_action;
  end if;

  if v_scope = 'deny' then
    return null;
  end if;

  return v_scope;
end;
$function$;

-- Admins only: writing an override is a permissions change, not a user edit.
drop policy user_permission_overrides_insert on public.user_permission_overrides;
drop policy user_permission_overrides_update on public.user_permission_overrides;
drop policy user_permission_overrides_delete on public.user_permission_overrides;
create policy user_permission_overrides_insert on public.user_permission_overrides
  for insert with check (app.can('role_permission', 'add'));
create policy user_permission_overrides_update on public.user_permission_overrides
  for update using (app.can('role_permission', 'edit')) with check (app.can('role_permission', 'edit'));
create policy user_permission_overrides_delete on public.user_permission_overrides
  for delete using (app.can('role_permission', 'delete'));

-- ---------------------------------------------------------------- role / super-admin guard

create function public.guard_privileged_user_fields()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  -- Service-role calls (the admin-users Edge Function, migrations) have no auth.uid().
  if auth.uid() is null then
    return new;
  end if;

  if new.role_id is distinct from old.role_id and not app.can('role_permission', 'edit') then
    raise exception 'Only an admin can change someone''s role.' using errcode = 'insufficient_privilege';
  end if;

  if new.is_super_admin is distinct from old.is_super_admin
     and not coalesce((select u.is_super_admin from public.users u where u.id = auth.uid()), false) then
    raise exception 'Only a Super Admin can grant or remove Super Admin.' using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$function$;

comment on function public.guard_privileged_user_fields is
  'A role change needs role_permission:edit and a super-admin change needs a super admin, whoever the target is (guard_self_edit only covered editing yourself).';

create trigger users_guard_privileged_fields
  before update of role_id, is_super_admin on public.users
  for each row execute function public.guard_privileged_user_fields();

revoke execute on function public.guard_privileged_user_fields() from public, anon, authenticated;

-- ---------------------------------------------------------------- clock location rules

create table public.clock_location_rules (
  id            uuid primary key default gen_random_uuid(),
  role_id       uuid references public.roles(id) on delete cascade,
  user_id       uuid references public.users(id) on delete cascade,
  direction     text not null check (direction in ('in', 'out')),
  location_ids  uuid[] not null default '{}',
  note          text,
  updated_by    uuid references public.users(id),
  updated_at    timestamptz not null default now(),
  constraint clock_location_rules_one_target check ((role_id is null) <> (user_id is null))
);

create unique index clock_location_rules_role_uq on public.clock_location_rules (role_id, direction) where role_id is not null;
create unique index clock_location_rules_user_uq on public.clock_location_rules (user_id, direction) where user_id is not null;

comment on table public.clock_location_rules is
  'Where a role / a person may clock in or out. location_ids empty = anywhere; no row = anywhere; a person rule beats the role rule.';

alter table public.clock_location_rules enable row level security;

create policy clock_location_rules_select on public.clock_location_rules
  for select to authenticated using (
    user_id = (select auth.uid())
    or role_id = (select u.role_id from public.users u where u.id = (select auth.uid()))
    or app.can('role_permission', 'view')
  );

create function app.clock_location_requirement(p_user uuid, p_direction text)
returns uuid[]
language sql
stable
security definer
set search_path to ''
as $function$
  select coalesce(
    (select r.location_ids from public.clock_location_rules r where r.user_id = p_user and r.direction = p_direction),
    (select r.location_ids from public.clock_location_rules r
       join public.users u on u.role_id = r.role_id
      where u.id = p_user and r.direction = p_direction),
    '{}'::uuid[]
  );
$function$;

comment on function app.clock_location_requirement is
  'Active-or-not location ids a person must be inside to clock in/out: their own rule, else their role''s, else {} (anywhere).';

-- Raises when a location rule applies and the point is inside none of its active locations.
create function app.assert_clock_location(p_user uuid, p_direction text, p_latitude numeric, p_longitude numeric)
returns void
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_req    uuid[] := app.clock_location_requirement(p_user, p_direction);
  v_names  text;
  v_near   text;
  v_dist   numeric;
begin
  if cardinality(v_req) = 0 then
    return;
  end if;
  -- A rule whose locations are all deactivated no longer restricts anyone.
  if not exists (select 1 from public.work_locations w where w.id = any(v_req) and w.active) then
    return;
  end if;
  if exists (
    select 1 from public.work_locations w
     where w.id = any(v_req) and w.active
       and app.metres_between(p_latitude, p_longitude, w.latitude, w.longitude) <= w.radius_m
  ) then
    return;
  end if;

  select string_agg(w.name, ' or ' order by w.name) into v_names
    from public.work_locations w where w.id = any(v_req) and w.active;
  select w.name, app.metres_between(p_latitude, p_longitude, w.latitude, w.longitude) into v_near, v_dist
    from public.work_locations w where w.id = any(v_req) and w.active
   order by app.metres_between(p_latitude, p_longitude, w.latitude, w.longitude) asc
   limit 1;

  raise exception 'You need to be at % to clock %. Nearest is % (% away).',
    v_names, p_direction, v_near,
    case when v_dist < 1000 then round(v_dist)::text || ' m' else round(v_dist / 1000, 1)::text || ' km' end
    using errcode = 'check_violation';
end;
$function$;

create or replace function app.clock_in(p_latitude numeric, p_longitude numeric, p_accuracy numeric, p_selfie_path text)
returns attendance
language plpgsql
set search_path to ''
as $function$
declare
  v_me          uuid := auth.uid();
  v_max_acc     integer;
  v_flags       text[] := '{}';
  v_row         public.attendance;
  v_location_id uuid;
begin
  if v_me is null then
    raise exception 'Not signed in' using errcode = 'insufficient_privilege';
  end if;
  if not app.within_clock_in_window() then
    raise exception 'Clock-in is only allowed shortly before and during working hours.' using errcode = 'check_violation';
  end if;
  if p_selfie_path is null or btrim(p_selfie_path) = '' then
    raise exception 'A clock-in selfie is required' using errcode = 'check_violation';
  end if;
  if p_latitude is null or p_longitude is null then
    raise exception 'Location is required to clock in' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.attendance where user_id = v_me and clock_out_at is null) then
    raise exception 'You are already clocked in.' using errcode = 'unique_violation';
  end if;

  select max_location_accuracy_m into v_max_acc from public.app_settings limit 1;
  v_max_acc := coalesce(v_max_acc, 100);

  if p_accuracy is not null and p_accuracy > v_max_acc then
    raise exception 'Location accuracy is too low (% m) to clock in -- % m or better is required. Move to an open area and try again.',
      round(p_accuracy), v_max_acc
      using errcode = 'check_violation';
  end if;

  perform app.assert_clock_location(v_me, 'in', p_latitude, p_longitude);

  select id into v_location_id
    from public.work_locations
   where active
     and app.metres_between(p_latitude, p_longitude, latitude, longitude) <= radius_m
   order by app.metres_between(p_latitude, p_longitude, latitude, longitude) asc
   limit 1;

  insert into public.attendance (
    clock_in_latitude, clock_in_longitude, clock_in_accuracy_m, clock_in_selfie_path, clock_in_location_id, flags
  ) values (
    p_latitude, p_longitude, p_accuracy, p_selfie_path, v_location_id, v_flags
  )
  returning * into v_row;

  return v_row;
end;
$function$;

create or replace function app.clock_out(p_latitude numeric, p_longitude numeric, p_accuracy numeric, p_selfie_path text)
returns jsonb
language plpgsql
set search_path to ''
as $function$
declare
  v_me          uuid := auth.uid();
  v_open        public.attendance;
  v_max_acc     integer;
  v_flags       text[];
  v_visit_id    uuid;
  v_closed      public.visits;
  v_row         public.attendance;
  v_location_id uuid;
begin
  if v_me is null then
    raise exception 'Not signed in' using errcode = 'insufficient_privilege';
  end if;
  if p_selfie_path is null or btrim(p_selfie_path) = '' then
    raise exception 'A clock-out selfie is required' using errcode = 'check_violation';
  end if;
  if p_latitude is null or p_longitude is null then
    raise exception 'Location is required to clock out' using errcode = 'check_violation';
  end if;

  select * into v_open from public.attendance where user_id = v_me and clock_out_at is null;
  if v_open.id is null then
    raise exception 'You are not clocked in.' using errcode = 'no_data_found';
  end if;

  -- Checked before anything changes, so a refused clock-out leaves the open visit alone.
  perform app.assert_clock_location(v_me, 'out', p_latitude, p_longitude);

  -- Critical rule: clocking out while a visit is still active force-checks
  -- that visit out first, flagged distinctly from a radius-triggered one,
  -- rather than blocking the clock-out.
  select id into v_visit_id
    from public.visits
   where user_id = v_me and checked_out_at is null and cancelled_at is null;

  if v_visit_id is not null then
    select * into v_closed from app._close_visit(v_visit_id, p_latitude, p_longitude, p_accuracy, 'AUTO_CHECKOUT_CLOCK_OUT');
  end if;

  select max_location_accuracy_m into v_max_acc from public.app_settings limit 1;
  v_max_acc := coalesce(v_max_acc, 100);

  v_flags := v_open.flags;
  if p_accuracy is not null and p_accuracy > v_max_acc and not (v_flags @> array['LOW_LOCATION_ACCURACY']) then
    v_flags := array_append(v_flags, 'LOW_LOCATION_ACCURACY');
  end if;

  select id into v_location_id
    from public.work_locations
   where active
     and app.metres_between(p_latitude, p_longitude, latitude, longitude) <= radius_m
   order by app.metres_between(p_latitude, p_longitude, latitude, longitude) asc
   limit 1;

  update public.attendance
     set clock_out_at = now(),
         clock_out_latitude = p_latitude,
         clock_out_longitude = p_longitude,
         clock_out_accuracy_m = p_accuracy,
         clock_out_selfie_path = p_selfie_path,
         clock_out_location_id = v_location_id,
         flags = v_flags
   where id = v_open.id
  returning * into v_row;

  return jsonb_build_object(
    'attendance', to_jsonb(v_row),
    'auto_checked_out_visit', to_jsonb(v_closed)
  );
end;
$function$;

-- ---------------------------------------------------------------- settings RPCs

create function app.assert_can_manage_permissions(p_module text default null)
returns void
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
  if not app.can('role_permission', 'edit') then
    raise exception 'insufficient_privilege' using detail = 'Only an admin can change permissions.';
  end if;
  -- The permission to manage permissions is itself Super Admin territory, so an admin can't lock others out or escalate.
  if p_module = 'role_permission'
     and not coalesce((select u.is_super_admin from public.users u where u.id = auth.uid()), false) then
    raise exception 'insufficient_privilege' using detail = 'Only a Super Admin can change who manages permissions.';
  end if;
end;
$function$;

-- rows: [{ "module_key": "...", "action": "view|add|edit|delete", "scope": "own|sub|any|deny" | null }]; null removes the row.
create function app.set_role_permissions(p_role_id uuid, p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_row   jsonb;
  v_count integer := 0;
begin
  perform app.assert_can_manage_permissions();
  if not exists (select 1 from public.roles where id = p_role_id) then
    raise exception 'not_found';
  end if;

  for v_row in select * from jsonb_array_elements(coalesce(p_rows, '[]')) loop
    perform app.assert_can_manage_permissions(v_row->>'module_key');
    if not exists (select 1 from public.modules m where m.key = v_row->>'module_key') then
      raise exception 'invalid_input' using detail = format('Unknown module %s', v_row->>'module_key');
    end if;

    if v_row->>'scope' is null then
      delete from public.role_permissions
       where role_id = p_role_id and module_key = v_row->>'module_key' and action = (v_row->>'action')::public.permission_action;
    else
      insert into public.role_permissions (role_id, module_key, action, scope)
      values (p_role_id, v_row->>'module_key', (v_row->>'action')::public.permission_action, (v_row->>'scope')::public.permission_scope)
      on conflict (role_id, module_key, action) do update set scope = excluded.scope;
    end if;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$function$;

comment on function app.set_role_permissions is
  'Admin: set or remove a role''s scope for (module, action) pairs in one call. Only a Super Admin may touch role_permission itself.';

-- rows: [{ "module_key", "action", "scope": "own|sub|any|deny|inherit", "note", "expires_at" }]; inherit removes the override.
create function app.set_user_overrides(p_user_id uuid, p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_row   jsonb;
  v_count integer := 0;
begin
  perform app.assert_can_manage_permissions();
  if not exists (select 1 from public.users where id = p_user_id) then
    raise exception 'not_found';
  end if;

  for v_row in select * from jsonb_array_elements(coalesce(p_rows, '[]')) loop
    perform app.assert_can_manage_permissions(v_row->>'module_key');
    if not exists (select 1 from public.modules m where m.key = v_row->>'module_key') then
      raise exception 'invalid_input' using detail = format('Unknown module %s', v_row->>'module_key');
    end if;

    if coalesce(v_row->>'scope', 'inherit') = 'inherit' then
      delete from public.user_permission_overrides
       where user_id = p_user_id and module_key = v_row->>'module_key' and action = (v_row->>'action')::public.permission_action;
    else
      insert into public.user_permission_overrides (user_id, module_key, action, scope, note, expires_at, updated_by, updated_at)
      values (
        p_user_id, v_row->>'module_key', (v_row->>'action')::public.permission_action, (v_row->>'scope')::public.permission_scope,
        nullif(btrim(coalesce(v_row->>'note', '')), ''), (v_row->>'expires_at')::timestamptz, auth.uid(), now()
      )
      on conflict (user_id, module_key, action) do update
        set scope = excluded.scope, note = excluded.note, expires_at = excluded.expires_at,
            updated_by = excluded.updated_by, updated_at = excluded.updated_at;
    end if;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$function$;

comment on function app.set_user_overrides is
  'Admin: give or deny one person a (module, action) regardless of their role, optionally until a date; inherit removes it.';

-- location_ids null = remove the rule (inherit); [] = anywhere; otherwise only those locations.
create function app.set_clock_location_rule(p_role_id uuid, p_user_id uuid, p_direction text, p_location_ids uuid[], p_note text default null)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  perform app.assert_can_manage_permissions();
  if (p_role_id is null) = (p_user_id is null) then
    raise exception 'invalid_input' using detail = 'Give either a role or a person.';
  end if;
  if p_direction not in ('in', 'out') then
    raise exception 'invalid_input' using detail = 'Direction is in or out.';
  end if;
  if p_location_ids is not null and exists (
    select 1 from unnest(p_location_ids) l(id) where not exists (select 1 from public.work_locations w where w.id = l.id)
  ) then
    raise exception 'invalid_input' using detail = 'Unknown work location.';
  end if;

  if p_location_ids is null then
    delete from public.clock_location_rules
     where direction = p_direction and role_id is not distinct from p_role_id and user_id is not distinct from p_user_id;
    return;
  end if;

  if p_role_id is not null then
    insert into public.clock_location_rules (role_id, direction, location_ids, note, updated_by)
    values (p_role_id, p_direction, p_location_ids, p_note, auth.uid())
    on conflict (role_id, direction) where role_id is not null
      do update set location_ids = excluded.location_ids, note = excluded.note, updated_by = excluded.updated_by, updated_at = now();
  else
    insert into public.clock_location_rules (user_id, direction, location_ids, note, updated_by)
    values (p_user_id, p_direction, p_location_ids, p_note, auth.uid())
    on conflict (user_id, direction) where user_id is not null
      do update set location_ids = excluded.location_ids, note = excluded.note, updated_by = excluded.updated_by, updated_at = now();
  end if;
end;
$function$;

create function app.my_clock_rules()
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
  select jsonb_object_agg(d.dir, coalesce(l.locs, '[]'::jsonb))
  from (values ('in'), ('out')) as d(dir)
  left join lateral (
    select jsonb_agg(jsonb_build_object('id', w.id, 'name', w.name, 'latitude', w.latitude, 'longitude', w.longitude, 'radius_m', w.radius_m) order by w.name) as locs
    from public.work_locations w
    where w.active and w.id = any(app.clock_location_requirement(auth.uid(), d.dir))
  ) l on true;
$function$;

comment on function app.my_clock_rules is
  'The active work locations the caller must be inside to clock in and to clock out ([] = anywhere), for the Check In screen.';

-- ---------------------------------------------------------------- public wrappers

create function public.set_role_permissions(p_role_id uuid, p_rows jsonb)
returns integer language sql set search_path to ''
as $function$ select app.set_role_permissions(p_role_id, p_rows); $function$;

create function public.set_user_overrides(p_user_id uuid, p_rows jsonb)
returns integer language sql set search_path to ''
as $function$ select app.set_user_overrides(p_user_id, p_rows); $function$;

create function public.set_clock_location_rule(p_role_id uuid, p_user_id uuid, p_direction text, p_location_ids uuid[], p_note text default null)
returns void language sql set search_path to ''
as $function$ select app.set_clock_location_rule(p_role_id, p_user_id, p_direction, p_location_ids, p_note); $function$;

create function public.my_clock_rules()
returns jsonb language sql stable set search_path to ''
as $function$ select app.my_clock_rules(); $function$;

-- ---------------------------------------------------------------- grants

revoke execute on function app.clock_location_requirement(uuid, text) from public;
revoke execute on function app.assert_clock_location(uuid, text, numeric, numeric) from public;
revoke execute on function app.assert_can_manage_permissions(text) from public;
revoke execute on function app.set_role_permissions(uuid, jsonb) from public;
revoke execute on function app.set_user_overrides(uuid, jsonb) from public;
revoke execute on function app.set_clock_location_rule(uuid, uuid, text, uuid[], text) from public;
revoke execute on function app.my_clock_rules() from public;
revoke execute on function public.set_role_permissions(uuid, jsonb) from public;
revoke execute on function public.set_user_overrides(uuid, jsonb) from public;
revoke execute on function public.set_clock_location_rule(uuid, uuid, text, uuid[], text) from public;
revoke execute on function public.my_clock_rules() from public;

-- clock_in / clock_out run as the caller, so the caller needs these two.
grant execute on function app.clock_location_requirement(uuid, text) to authenticated;
grant execute on function app.assert_clock_location(uuid, text, numeric, numeric) to authenticated;
grant execute on function app.assert_can_manage_permissions(text) to authenticated;
grant execute on function app.set_role_permissions(uuid, jsonb) to authenticated;
grant execute on function app.set_user_overrides(uuid, jsonb) to authenticated;
grant execute on function app.set_clock_location_rule(uuid, uuid, text, uuid[], text) to authenticated;
grant execute on function app.my_clock_rules() to authenticated;
grant execute on function public.set_role_permissions(uuid, jsonb) to authenticated;
grant execute on function public.set_user_overrides(uuid, jsonb) to authenticated;
grant execute on function public.set_clock_location_rule(uuid, uuid, text, uuid[], text) to authenticated;
grant execute on function public.my_clock_rules() to authenticated;
