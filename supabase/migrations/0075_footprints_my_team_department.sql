-- Footprints: expose department on app.my_team()/public.my_team(), so the
-- Fleet List and Reports tabs can group members by department.
--
-- department_id/department_name already exist (public.users.department_id,
-- public.departments -- added outside this repo's local migration history,
-- same as several other columns/tables this repo's migrations already
-- note). app.manageable_users() already joins them the same way
-- (`left join public.departments d on d.id = u.department_id`) for the
-- Users admin screen -- this mirrors that exact join.
--
-- A RETURNS TABLE column-set change needs DROP + CREATE, not a plain
-- CREATE OR REPLACE (Postgres rejects changing an existing function's
-- return type in place).
drop function if exists public.my_team();
drop function if exists app.my_team();

create function app.my_team()
returns table (
  id uuid,
  full_name text,
  nickname text,
  photo_path text,
  "position" text,
  role_name text,
  manager_id uuid,
  is_field_sales boolean,
  department_id uuid,
  department_name text
)
language sql
stable
set search_path to ''
as $function$
  select u.id, u.full_name, u.nickname, u.photo_path, u."position", r.name as role_name, u.manager_id, u.is_field_sales,
         u.department_id, d.name as department_name
    from public.users u
    join public.roles r on r.id = u.role_id
    left join public.departments d on d.id = u.department_id
   where u.status = 'active'
     and app.can('attendance', 'view', u.id)
   order by u.full_name;
$function$;

create function public.my_team()
returns table (
  id uuid,
  full_name text,
  nickname text,
  photo_path text,
  "position" text,
  role_name text,
  manager_id uuid,
  is_field_sales boolean,
  department_id uuid,
  department_name text
)
language sql
stable
set search_path to ''
as $function$ select * from app.my_team(); $function$;

-- This environment's migration-apply role grants EXECUTE to PUBLIC by
-- default (see 0068's comment) -- revoke it and grant only what's needed,
-- same as 0069_footprints_my_team.sql originally did.
revoke execute on function app.my_team() from public;
revoke execute on function public.my_team() from public;
grant execute on function app.my_team() to authenticated;
grant execute on function public.my_team() to authenticated;
