-- Footprints: attendance (Clock In / Clock Out) system.
--
-- This migration is purely additive:
--   * No existing table, column, or row is removed.
--   * app.check_in / app.check_out gain a new trailing p_accuracy parameter.
--     NOTE: CREATE OR REPLACE with an added parameter does NOT extend the
--     existing function in Postgres -- it creates a separate overload. The
--     old 3-arg overloads (and their grants) were left behind here and are
--     removed in 0067_footprints_attendance_fixups.sql once that was
--     discovered; see that file for details. Read this migration together
--     with 0067 and 0068, which correct both that and a default-EXECUTE-
--     grant surprise from this environment's migration-apply role.
--   * visits.customer_id becomes nullable (it was NOT NULL before) to allow
--     unassigned visits. Every existing row already has a customer_id, so
--     this cannot violate any existing row.
--
-- Style follows the existing codebase convention seen in prior migrations:
--   * Business logic lives in the `app` schema; thin SQL wrappers in
--     `public` are what PostgREST actually exposes as RPC endpoints.
--   * New functions get no privileges by default in this database (see
--     0011_revoke_anon / 0012_revoke_public_execute) -- EXECUTE is granted
--     explicitly to `authenticated` below.

-- ---------------------------------------------------------------------------
-- 1. app_settings: centralised, admin-editable configuration
-- ---------------------------------------------------------------------------
alter table public.app_settings
  add column location_ping_interval_minutes integer not null default 5,
  add column max_location_accuracy_m integer not null default 100;

comment on column public.app_settings.checkin_radius_m is
  'Visit radius in metres used both to flag an out-of-range check-in/out and to monitor an active visit for auto check-out.';
comment on column public.app_settings.location_ping_interval_minutes is
  'How often the app should record a location ping while a visit is active.';
comment on column public.app_settings.max_location_accuracy_m is
  'GPS accuracy (metres) above which a reading is flagged LOW_LOCATION_ACCURACY instead of being rejected.';

-- ---------------------------------------------------------------------------
-- 2. attendance: Clock In -> Clock Out, independent of customer visits
-- ---------------------------------------------------------------------------
create table public.attendance (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null default auth.uid() references public.users(id) on delete cascade,
  clock_in_at            timestamptz not null default now(),
  clock_in_latitude      numeric not null,
  clock_in_longitude     numeric not null,
  clock_in_accuracy_m    numeric,
  clock_in_selfie_path   text not null,
  clock_out_at           timestamptz,
  clock_out_latitude     numeric,
  clock_out_longitude    numeric,
  clock_out_accuracy_m   numeric,
  clock_out_selfie_path  text,
  flags                  text[] not null default '{}'::text[],
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint attendance_latlong_out_ck check ((clock_out_latitude is null) = (clock_out_longitude is null)),
  constraint attendance_order_ck check (clock_out_at is null or clock_out_at >= clock_in_at),
  constraint attendance_clockout_fields_ck check (
    (clock_out_at is null and clock_out_latitude is null and clock_out_selfie_path is null)
    or (clock_out_at is not null and clock_out_latitude is not null and clock_out_selfie_path is not null)
  )
);

comment on table public.attendance is
  'Clock In / Clock Out working sessions. Independent of public.visits: a user can clock in/out with zero customer visits, and can have many visits between one clock-in and its clock-out.';

-- Only one open (not yet clocked out) attendance session per person, mirroring
-- visits_one_open_per_person on public.visits.
create unique index attendance_one_open_per_person on public.attendance (user_id) where (clock_out_at is null);
create index attendance_user_id_clock_in_at_idx on public.attendance (user_id, clock_in_at desc);

alter table public.attendance enable row level security;

create policy attendance_select on public.attendance
  for select to authenticated
  using (app.can('attendance', 'view', user_id));

create policy attendance_insert on public.attendance
  for insert to authenticated
  with check (app.can('attendance', 'add', user_id));

create policy attendance_update on public.attendance
  for update to authenticated
  using (app.can('attendance', 'edit', user_id))
  with check (app.can('attendance', 'edit', user_id));

create trigger attendance_set_updated_at
  before update on public.attendance
  for each row execute function public.set_updated_at();

-- Guard historical attendance the same way guard_visit_edit protects visits:
-- clock-in facts are permanent, clock-out facts are permanent once set.
create or replace function public.guard_attendance_edit()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if new.user_id is distinct from old.user_id then
    raise exception 'An attendance record cannot be moved to another person' using errcode = 'check_violation';
  end if;

  if new.clock_in_at is distinct from old.clock_in_at
     or new.clock_in_latitude is distinct from old.clock_in_latitude
     or new.clock_in_longitude is distinct from old.clock_in_longitude
     or new.clock_in_selfie_path is distinct from old.clock_in_selfie_path then
    raise exception 'Clock-in details cannot be changed' using errcode = 'check_violation';
  end if;

  if old.clock_out_at is not null and (
       new.clock_out_at is distinct from old.clock_out_at
    or new.clock_out_latitude is distinct from old.clock_out_latitude
    or new.clock_out_longitude is distinct from old.clock_out_longitude
    or new.clock_out_selfie_path is distinct from old.clock_out_selfie_path
  ) then
    raise exception 'Clock-out details cannot be changed' using errcode = 'check_violation';
  end if;

  return new;
end;
$function$;

create trigger attendance_guard_edit
  before update on public.attendance
  for each row execute function public.guard_attendance_edit();

-- ---------------------------------------------------------------------------
-- 3. location_pings: periodic samples while a visit is active
-- ---------------------------------------------------------------------------
create table public.location_pings (
  id          bigint generated by default as identity primary key,
  visit_id    uuid not null references public.visits(id) on delete cascade,
  user_id     uuid not null default auth.uid() references public.users(id) on delete cascade,
  latitude    numeric not null,
  longitude   numeric not null,
  accuracy_m  numeric,
  distance_m  integer,
  out_of_range boolean not null default false,
  created_at  timestamptz not null default now()
);

comment on table public.location_pings is
  'Periodic location samples recorded while a customer visit is active, used to monitor the visit radius and drive auto check-out. Immutable: no update/delete policy is defined.';

create index location_pings_visit_id_idx on public.location_pings (visit_id, created_at desc);
create index location_pings_user_id_idx on public.location_pings (user_id, created_at desc);

alter table public.location_pings enable row level security;

create policy location_pings_select on public.location_pings
  for select to authenticated
  using (app.can('attendance', 'view', user_id));

create policy location_pings_insert on public.location_pings
  for insert to authenticated
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 4. visits: allow unassigned visits, preserve GPS accuracy, add flags
-- ---------------------------------------------------------------------------
alter table public.visits
  alter column customer_id drop not null,
  add column in_accuracy_m  numeric,
  add column out_accuracy_m numeric,
  add column attendance_id  uuid references public.attendance(id) on delete set null,
  add column visit_number   integer,
  add column flags          text[] not null default '{}'::text[];

comment on column public.visits.flags is
  'Standardised flags: UNASSIGNED_VISIT, LOW_LOCATION_ACCURACY, LOCATION_UNAVAILABLE, AUTO_CHECKOUT_OUTSIDE_RADIUS, AUTO_CHECKOUT_CLOCK_OUT, TRACKING_INTERRUPTED.';
comment on column public.visits.visit_number is
  'The nth visit this user started on its calendar day (Asia/Phnom_Penh), for display as "Visit #N".';
comment on column public.visits.attendance_id is
  'The Clock In / Clock Out session this visit happened under. A visit can only be created while an attendance session is open.';

create index visits_attendance_id_idx on public.visits (attendance_id);

-- guard_visit_edit only inspects columns that already existed; the new
-- columns above are untouched by it and remain freely settable by the
-- check_in/check_out/record_location_ping RPCs below.

-- ---------------------------------------------------------------------------
-- 5. app.check_in / app.check_out: require an open attendance session,
--    capture accuracy, flag unassigned/low-accuracy visits, number the visit
-- ---------------------------------------------------------------------------
create or replace function app.check_in(
  p_customer  uuid,
  p_latitude  numeric,
  p_longitude numeric,
  p_accuracy  numeric default null
)
returns visits
language plpgsql
set search_path to ''
as $function$
declare
  v_me         uuid := auth.uid();
  v_radius     integer;
  v_max_acc    integer;
  v_lat        numeric;
  v_lng        numeric;
  v_dist       integer;
  v_visit      public.visits;
  v_attendance uuid;
  v_flags      text[] := '{}';
  v_number     integer;
begin
  if v_me is null then
    raise exception 'Not signed in' using errcode = 'insufficient_privilege';
  end if;

  if not app.within_check_window() then
    raise exception 'Check-in is only allowed between 7:00 AM and 8:00 PM.'
      using errcode = 'check_violation';
  end if;

  select id into v_attendance
    from public.attendance
   where user_id = v_me and clock_out_at is null;

  if v_attendance is null then
    raise exception 'You must clock in before starting a visit.'
      using errcode = 'check_violation';
  end if;

  if exists (
    select 1 from public.visits
     where user_id = v_me and checked_out_at is null and cancelled_at is null
  ) then
    raise exception 'You are still checked in somewhere. Check out first.'
      using errcode = 'unique_violation';
  end if;

  select checkin_radius_m, max_location_accuracy_m into v_radius, v_max_acc
    from public.app_settings limit 1;
  v_radius := coalesce(v_radius, 200);
  v_max_acc := coalesce(v_max_acc, 100);

  if p_customer is not null then
    select c.latitude, c.longitude into v_lat, v_lng
      from public.customers c where c.id = p_customer;

    if not found then
      raise exception 'No such customer' using errcode = 'no_data_found';
    end if;
  else
    v_flags := array_append(v_flags, 'UNASSIGNED_VISIT');
  end if;

  if v_lat is not null and p_latitude is not null then
    v_dist := round(app.metres_between(p_latitude, p_longitude, v_lat, v_lng));
  end if;

  if p_accuracy is not null and p_accuracy > v_max_acc then
    v_flags := array_append(v_flags, 'LOW_LOCATION_ACCURACY');
  end if;

  select count(*) + 1 into v_number
    from public.visits
   where user_id = v_me
     and (checked_in_at at time zone 'Asia/Phnom_Penh')::date
       = (now() at time zone 'Asia/Phnom_Penh')::date;

  insert into public.visits (
    customer_id, in_latitude, in_longitude, in_accuracy_m,
    distance_m, radius_m, out_of_range, attendance_id, visit_number, flags
  ) values (
    p_customer, p_latitude, p_longitude, p_accuracy,
    v_dist, v_radius, coalesce(v_dist > v_radius, false),
    v_attendance, v_number, v_flags
  )
  returning * into v_visit;

  return v_visit;
end;
$function$;

-- Internal helper shared by app.check_out, app.clock_out and
-- app.record_location_ping so "close this visit" has exactly one
-- implementation. Not exposed via a public wrapper.
create or replace function app._close_visit(
  p_visit     uuid,
  p_latitude  numeric,
  p_longitude numeric,
  p_accuracy  numeric,
  p_auto_flag text -- null for a manual check-out, otherwise the flag to add
)
returns visits
language plpgsql
set search_path to ''
as $function$
declare
  v_visit   public.visits;
  v_radius  integer;
  v_max_acc integer;
  v_lat     numeric;
  v_lng     numeric;
  v_dist    integer;
  v_flags   text[];
begin
  select v.* into v_visit
    from public.visits v
   where v.id = p_visit and v.checked_out_at is null and v.cancelled_at is null;

  if v_visit.id is null then
    return null;
  end if;

  select checkin_radius_m, max_location_accuracy_m into v_radius, v_max_acc
    from public.app_settings limit 1;
  v_radius := coalesce(v_radius, 200);
  v_max_acc := coalesce(v_max_acc, 100);

  if v_visit.customer_id is not null then
    select c.latitude, c.longitude into v_lat, v_lng
      from public.customers c where c.id = v_visit.customer_id;
  end if;

  if v_lat is not null and p_latitude is not null then
    v_dist := round(app.metres_between(p_latitude, p_longitude, v_lat, v_lng));
  end if;

  v_flags := v_visit.flags;
  if p_accuracy is not null and p_accuracy > v_max_acc and not (v_flags @> array['LOW_LOCATION_ACCURACY']) then
    v_flags := array_append(v_flags, 'LOW_LOCATION_ACCURACY');
  end if;
  if p_auto_flag is not null and not (v_flags @> array[p_auto_flag]) then
    v_flags := array_append(v_flags, p_auto_flag);
  end if;

  update public.visits
     set checked_out_at = now(),
         out_latitude = p_latitude,
         out_longitude = p_longitude,
         out_accuracy_m = p_accuracy,
         checkout_distance_m = v_dist,
         checkout_out_of_range = coalesce(v_dist > v_radius, false),
         auto_closed = (p_auto_flag is not null),
         flags = v_flags
   where id = p_visit and checked_out_at is null and cancelled_at is null
  returning * into v_visit;

  return v_visit;
end;
$function$;

create or replace function app.check_out(
  p_visit     uuid,
  p_latitude  numeric,
  p_longitude numeric,
  p_accuracy  numeric default null
)
returns visits
language plpgsql
set search_path to ''
as $function$
declare
  v_visit public.visits;
begin
  if not app.within_check_window() then
    raise exception 'Check-out is only allowed between 7:00 AM and 8:00 PM.'
      using errcode = 'check_violation';
  end if;

  select * into v_visit from app._close_visit(p_visit, p_latitude, p_longitude, p_accuracy, null);

  if v_visit.id is null then
    raise exception 'That visit is not open' using errcode = 'no_data_found';
  end if;

  return v_visit;
end;
$function$;

create or replace function public.check_in(p_customer uuid, p_latitude numeric, p_longitude numeric, p_accuracy numeric default null)
returns visits
language sql
set search_path to ''
as $function$ select app.check_in(p_customer, p_latitude, p_longitude, p_accuracy); $function$;

create or replace function public.check_out(p_visit uuid, p_latitude numeric, p_longitude numeric, p_accuracy numeric default null)
returns visits
language sql
set search_path to ''
as $function$ select app.check_out(p_visit, p_latitude, p_longitude, p_accuracy); $function$;

-- ---------------------------------------------------------------------------
-- 6. app.clock_in / app.clock_out
-- ---------------------------------------------------------------------------
create or replace function app.clock_in(
  p_latitude    numeric,
  p_longitude   numeric,
  p_accuracy    numeric,
  p_selfie_path text
)
returns attendance
language plpgsql
set search_path to ''
as $function$
declare
  v_me      uuid := auth.uid();
  v_max_acc integer;
  v_flags   text[] := '{}';
  v_row     public.attendance;
begin
  if v_me is null then
    raise exception 'Not signed in' using errcode = 'insufficient_privilege';
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
    v_flags := array_append(v_flags, 'LOW_LOCATION_ACCURACY');
  end if;

  insert into public.attendance (
    clock_in_latitude, clock_in_longitude, clock_in_accuracy_m, clock_in_selfie_path, flags
  ) values (
    p_latitude, p_longitude, p_accuracy, p_selfie_path, v_flags
  )
  returning * into v_row;

  return v_row;
end;
$function$;

create or replace function app.clock_out(
  p_latitude    numeric,
  p_longitude   numeric,
  p_accuracy    numeric,
  p_selfie_path text
)
returns jsonb
language plpgsql
set search_path to ''
as $function$
declare
  v_me       uuid := auth.uid();
  v_open     public.attendance;
  v_max_acc  integer;
  v_flags    text[];
  v_visit_id uuid;
  v_closed   public.visits;
  v_row      public.attendance;
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

  -- Critical rule: clocking out while a visit is still active auto-checks
  -- that visit out first, flagged distinctly from a radius-triggered one.
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

  update public.attendance
     set clock_out_at = now(),
         clock_out_latitude = p_latitude,
         clock_out_longitude = p_longitude,
         clock_out_accuracy_m = p_accuracy,
         clock_out_selfie_path = p_selfie_path,
         flags = v_flags
   where id = v_open.id
  returning * into v_row;

  return jsonb_build_object(
    'attendance', to_jsonb(v_row),
    'auto_checked_out_visit', to_jsonb(v_closed)
  );
end;
$function$;

create or replace function public.clock_in(p_latitude numeric, p_longitude numeric, p_accuracy numeric, p_selfie_path text)
returns attendance
language sql
set search_path to ''
as $function$ select app.clock_in(p_latitude, p_longitude, p_accuracy, p_selfie_path); $function$;

create or replace function public.clock_out(p_latitude numeric, p_longitude numeric, p_accuracy numeric, p_selfie_path text)
returns jsonb
language sql
set search_path to ''
as $function$ select app.clock_out(p_latitude, p_longitude, p_accuracy, p_selfie_path); $function$;

-- ---------------------------------------------------------------------------
-- 7. app.record_location_ping: active-visit monitoring + radius auto check-out
-- ---------------------------------------------------------------------------
create or replace function app.record_location_ping(
  p_visit     uuid,
  p_latitude  numeric,
  p_longitude numeric,
  p_accuracy  numeric default null
)
returns jsonb
language plpgsql
set search_path to ''
as $function$
declare
  v_me     uuid := auth.uid();
  v_visit  public.visits;
  v_dist   integer;
  v_out    boolean;
  v_ping   public.location_pings;
  v_closed public.visits;
begin
  if v_me is null then
    raise exception 'Not signed in' using errcode = 'insufficient_privilege';
  end if;

  select * into v_visit
    from public.visits
   where id = p_visit and user_id = v_me and checked_out_at is null and cancelled_at is null;

  if v_visit.id is null then
    raise exception 'That visit is not open' using errcode = 'no_data_found';
  end if;

  if v_visit.in_latitude is not null and p_latitude is not null then
    v_dist := round(app.metres_between(p_latitude, p_longitude, v_visit.in_latitude, v_visit.in_longitude));
  end if;
  v_out := coalesce(v_dist > v_visit.radius_m, false);

  insert into public.location_pings (visit_id, user_id, latitude, longitude, accuracy_m, distance_m, out_of_range)
  values (p_visit, v_me, p_latitude, p_longitude, p_accuracy, v_dist, v_out)
  returning * into v_ping;

  if v_out then
    select * into v_closed
      from app._close_visit(p_visit, p_latitude, p_longitude, p_accuracy, 'AUTO_CHECKOUT_OUTSIDE_RADIUS');
  end if;

  return jsonb_build_object(
    'ping', to_jsonb(v_ping),
    'auto_checked_out', v_out,
    'visit', to_jsonb(v_closed)
  );
end;
$function$;

create or replace function public.record_location_ping(p_visit uuid, p_latitude numeric, p_longitude numeric, p_accuracy numeric default null)
returns jsonb
language sql
set search_path to ''
as $function$ select app.record_location_ping(p_visit, p_latitude, p_longitude, p_accuracy); $function$;

-- ---------------------------------------------------------------------------
-- 8. app.nearby_customers: efficient geospatial suggestion for Check In
-- ---------------------------------------------------------------------------
create or replace function app.nearby_customers(
  p_latitude  numeric,
  p_longitude numeric,
  p_limit     integer default 20
)
returns table (
  id             uuid,
  shop_name      text,
  business_type  text,
  street_address text,
  distance_m     integer
)
language sql
stable
set search_path to ''
as $function$
  select c.id, c.shop_name, c.business_type, c.street_address,
         round(app.metres_between(p_latitude, p_longitude, c.latitude, c.longitude))::integer as distance_m
    from public.customers c
   where c.status = 'active'
   order by distance_m
   limit greatest(1, least(coalesce(p_limit, 20), 50));
$function$;

comment on function app.nearby_customers is
  'Runs under the caller''s own privileges, so the existing customers_select RLS policy still applies -- this only adds distance ordering, it does not widen visibility.';

create or replace function public.nearby_customers(p_latitude numeric, p_longitude numeric, p_limit integer default 20)
returns table (id uuid, shop_name text, business_type text, street_address text, distance_m integer)
language sql
stable
set search_path to ''
as $function$ select * from app.nearby_customers(p_latitude, p_longitude, p_limit); $function$;

-- ---------------------------------------------------------------------------
-- 9. Grants (default privileges in this database give new functions no
--    EXECUTE to anyone but the owning role -- grant explicitly)
-- ---------------------------------------------------------------------------
grant execute on function app.clock_in(numeric, numeric, numeric, text) to authenticated;
grant execute on function app.clock_out(numeric, numeric, numeric, text) to authenticated;
grant execute on function app._close_visit(uuid, numeric, numeric, numeric, text) to authenticated;
grant execute on function app.record_location_ping(uuid, numeric, numeric, numeric) to authenticated;
grant execute on function app.nearby_customers(numeric, numeric, integer) to authenticated;

grant execute on function public.clock_in(numeric, numeric, numeric, text) to authenticated;
grant execute on function public.clock_out(numeric, numeric, numeric, text) to authenticated;
grant execute on function public.record_location_ping(uuid, numeric, numeric, numeric) to authenticated;
grant execute on function public.nearby_customers(numeric, numeric, integer) to authenticated;

-- app.check_in/app.check_out/public.check_in/public.check_out already carried
-- an authenticated EXECUTE grant before this migration; CREATE OR REPLACE
-- does not revoke existing grants, so no re-grant is required for them.

-- ---------------------------------------------------------------------------
-- 10. Storage: private bucket for attendance selfies
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('attendance', 'attendance', false, 5242880, array['image/jpeg','image/png','image/webp','image/heic'])
on conflict (id) do nothing;

-- Path convention: <user_id>/<clock_in|clock_out>-<timestamp>.<ext>, matching
-- the <owner-folder>/<file> convention already used by the avatars/customers
-- buckets. Selfies are audit evidence: insert + read only, no update/delete.
create policy attendance_storage_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'attendance'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy attendance_storage_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'attendance'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or app.can('attendance', 'view', ((storage.foldername(name))[1])::uuid)
    )
  );

-- ---------------------------------------------------------------------------
-- 11. Register the 'attendance' module (role_permissions.module_key has a
--     FK to modules.key, same as every other module in this system) and
--     grant role permissions mirroring the scopes already assigned to the
--     'visit' module for the same roles.
-- ---------------------------------------------------------------------------
insert into public.modules (key, name, icon, href, sort_order, active, group_name)
values ('attendance', 'Attendance', 'clock', 'attendance', 14, true, 'Selling')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, module_key, action, scope)
select r.id, 'attendance', v.action, v.scope
from public.roles r
join (values
  ('System Admin',    'view'::permission_action, 'any'::permission_scope),
  ('System Admin',    'add',                      'any'),
  ('System Admin',    'edit',                      'any'),
  ('System Admin',    'delete',                    'any'),
  ('Sales Team',      'view',                      'own'),
  ('Sales Team',      'add',                        'own'),
  ('Sales Team',      'edit',                       'own'),
  ('Sale Supervisor', 'view',                       'sub'),
  ('Sale Manager',    'view',                       'sub')
) as v(role_name, action, scope) on v.role_name = r.name
on conflict (role_id, module_key, action) do nothing;
