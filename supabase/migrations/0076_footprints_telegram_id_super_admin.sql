-- Footprints: let a Super Admin set any user's Telegram ID (used by the
-- manager-alerts feature in 0072-0074 to know who to message), and expose
-- it on app.manageable_users()/public.manageable_users() so the Users
-- admin screen can display/prefill it.
--
-- This is deliberately gated stricter than the normal role_permissions
-- system: HR and System Admin roles already have user:edit scope 'any'
-- (so the generic `users` UPDATE RLS would let either set anyone's
-- telegram_id if it were just folded into the existing plain-field
-- update), but `is_super_admin` is a separate, orthogonal flag -- no role
-- is named "Super Admin". set_user_telegram_id is `security definer` so
-- its own explicit is_super_admin check is the *only* gate, independent
-- of role_permissions.
--
-- A RETURNS TABLE column-set change needs DROP + CREATE, not a plain
-- CREATE OR REPLACE (same reasoning as 0075_footprints_my_team_department.sql).
drop function if exists public.manageable_users();
drop function if exists app.manageable_users();

create function app.manageable_users()
returns table (
  id uuid,
  full_name text,
  nickname text,
  email text,
  phone_primary text,
  photo_path text,
  "position" text,
  department_id uuid,
  department_name text,
  manager_id uuid,
  manager_name text,
  role_id uuid,
  role_name text,
  status user_status,
  is_super_admin boolean,
  is_field_sales boolean,
  employment_date date,
  created_at timestamptz,
  telegram_id text
)
language sql
stable
set search_path to ''
as $function$
  select
    u.id, u.full_name, u.nickname, u.email, u.phone_primary, u.photo_path, u."position",
    u.department_id, d.name as department_name,
    u.manager_id, m.full_name as manager_name,
    u.role_id, r.name as role_name,
    u.status, u.is_super_admin, u.is_field_sales,
    u.employment_date, u.created_at, u.telegram_id
  from public.users u
  left join public.departments d on d.id = u.department_id
  left join public.users m on m.id = u.manager_id
  left join public.roles r on r.id = u.role_id
  where app.can('user', 'view', u.id)
  order by u.full_name;
$function$;

create function public.manageable_users()
returns table (
  id uuid,
  full_name text,
  nickname text,
  email text,
  phone_primary text,
  photo_path text,
  "position" text,
  department_id uuid,
  department_name text,
  manager_id uuid,
  manager_name text,
  role_id uuid,
  role_name text,
  status user_status,
  is_super_admin boolean,
  is_field_sales boolean,
  employment_date date,
  created_at timestamptz,
  telegram_id text
)
language sql
stable
set search_path to ''
as $function$ select * from app.manageable_users(); $function$;

revoke execute on function app.manageable_users() from public;
revoke execute on function public.manageable_users() from public;
grant execute on function app.manageable_users() to authenticated;
grant execute on function public.manageable_users() to authenticated;

-- Sets a user's Telegram chat ID -- gated on the caller being a super
-- admin, full stop, regardless of role_permissions. security definer so
-- this check (not the generic users_update RLS) is the sole authority.
create function app.set_user_telegram_id(p_user_id uuid, p_telegram_id text)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if not exists (select 1 from public.users where id = auth.uid() and is_super_admin) then
    raise exception 'Only a super admin can set a user''s Telegram ID' using errcode = 'insufficient_privilege';
  end if;

  update public.users set telegram_id = nullif(btrim(p_telegram_id), '') where id = p_user_id;
end;
$function$;

-- No security definer needed here -- this is a plain passthrough, and
-- auth.uid() still resolves to the real caller inside the definer
-- function it invokes, same as every other app.*/public.* wrapper pair.
create function public.set_user_telegram_id(p_user_id uuid, p_telegram_id text)
returns void
language plpgsql
set search_path to ''
as $function$
begin
  perform app.set_user_telegram_id(p_user_id, p_telegram_id);
end;
$function$;

revoke execute on function app.set_user_telegram_id(uuid, text) from public;
revoke execute on function public.set_user_telegram_id(uuid, text) from public;
grant execute on function app.set_user_telegram_id(uuid, text) to authenticated;
grant execute on function public.set_user_telegram_id(uuid, text) to authenticated;
