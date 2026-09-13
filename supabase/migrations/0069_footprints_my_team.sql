-- app.my_team(): the exact set of people whose attendance the caller can
-- see, for the Fleet screen. Deliberately reuses app.can('attendance',
-- 'view', u.id) rather than re-implementing the own/sub/any scope logic --
-- so "who shows up in Fleet" can never drift out of sync with "whose
-- attendance/visit rows RLS actually returns". Includes the caller
-- themselves (app.can returns true for p_owner = self), which is correct:
-- an admin or supervisor is part of their own fleet view too.

create or replace function app.my_team()
returns table (
  id uuid,
  full_name text,
  photo_path text,
  "position" text,
  role_name text,
  manager_id uuid
)
language sql
stable
set search_path to ''
as $function$
  select u.id, u.full_name, u.photo_path, u."position", r.name as role_name, u.manager_id
    from public.users u
    join public.roles r on r.id = u.role_id
   where u.status = 'active'
     and app.can('attendance', 'view', u.id)
   order by u.full_name;
$function$;

create or replace function public.my_team()
returns table (id uuid, full_name text, photo_path text, "position" text, role_name text, manager_id uuid)
language sql
stable
set search_path to ''
as $function$ select * from app.my_team(); $function$;

-- This environment's migration-apply role grants EXECUTE to PUBLIC by
-- default (see 0068's comment) -- revoke it and grant only what's needed.
revoke execute on function app.my_team() from public;
revoke execute on function public.my_team() from public;
grant execute on function app.my_team() to authenticated;
grant execute on function public.my_team() to authenticated;
