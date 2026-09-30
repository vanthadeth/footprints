-- Footprints: the Super Admin adds and edits departments and roles.
--
-- Nothing is ever deleted: a department or role is switched off
-- (active = false), which hides it from pickers while everyone already in
-- it stays as they are. A role's `key` is set once from its name and never
-- changes -- server functions and seeds refer to roles by key -- so renaming
-- a role is always safe. A new role can start with another role's
-- permissions (role_permissions and its clock location rules).

create function app.assert_super_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not coalesce((select u.is_super_admin from public.users u where u.id = auth.uid()), false) then
    raise exception 'insufficient_privilege' using errcode = 'insufficient_privilege',
      detail = 'Only a Super Admin can manage departments and roles.';
  end if;
end;
$$;

-- Roles and departments with how many active people are in each.
create function app.org_overview()
returns table (
  kind        text,
  id          uuid,
  name        text,
  description text,
  key         text,
  active      boolean,
  sort_order  integer,
  people      integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app.assert_super_admin();
  return query
    select 'role'::text, r.id, r.name, r.description, r.key, r.active, r.sort_order,
           (select count(*)::integer from public.users u where u.role_id = r.id and u.status = 'active')
      from public.roles r
    union all
    select 'department'::text, d.id, d.name, null::text, null::text, d.active, d.sort_order,
           (select count(*)::integer from public.users u where u.department_id = d.id and u.status = 'active')
      from public.departments d
    order by 1, 7, 3;
end;
$$;

create function app.save_department(p_id uuid, p_name text, p_active boolean default true)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_id   uuid;
begin
  perform app.assert_super_admin();
  if v_name = '' then
    raise exception 'invalid_input' using detail = 'A department needs a name.';
  end if;
  if exists (select 1 from public.departments d where lower(d.name) = lower(v_name) and d.id is distinct from p_id) then
    raise exception 'invalid_input' using detail = format('There is already a department called %s.', v_name);
  end if;

  if p_id is null then
    insert into public.departments (name, active, sort_order)
    values (v_name, coalesce(p_active, true), coalesce((select max(sort_order) from public.departments), 0) + 1)
    returning id into v_id;
  else
    update public.departments
       set name = v_name, active = coalesce(p_active, active)
     where id = p_id
    returning id into v_id;
    if v_id is null then
      raise exception 'not_found';
    end if;
  end if;
  return v_id;
end;
$$;

create function app.save_role(
  p_id uuid,
  p_name text,
  p_description text default null,
  p_active boolean default true,
  p_copy_from uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_base text;
  v_key  text;
  v_n    integer := 1;
  v_id   uuid;
begin
  perform app.assert_super_admin();
  if v_name = '' then
    raise exception 'invalid_input' using detail = 'A role needs a name.';
  end if;
  if exists (select 1 from public.roles r where lower(r.name) = lower(v_name) and r.id is distinct from p_id) then
    raise exception 'invalid_input' using detail = format('There is already a role called %s.', v_name);
  end if;

  if p_id is not null then
    update public.roles
       set name = v_name, description = nullif(btrim(coalesce(p_description, '')), ''), active = coalesce(p_active, active)
     where id = p_id
    returning id into v_id;
    if v_id is null then
      raise exception 'not_found';
    end if;
    return v_id;
  end if;

  -- Key from the name ("Field Service" -> field_service); Khmer-only names fall back to "role".
  v_base := coalesce(nullif(btrim(regexp_replace(lower(v_name), '[^a-z0-9]+', '_', 'g'), '_'), ''), 'role');
  v_key := v_base;
  while exists (select 1 from public.roles r where r.key = v_key) loop
    v_n := v_n + 1;
    v_key := v_base || '_' || v_n;
  end loop;

  insert into public.roles (key, name, description, active, sort_order)
  values (v_key, v_name, nullif(btrim(coalesce(p_description, '')), ''), coalesce(p_active, true),
          coalesce((select max(sort_order) from public.roles), 0) + 1)
  returning id into v_id;

  if p_copy_from is not null then
    insert into public.role_permissions (role_id, module_key, action, scope)
    select v_id, rp.module_key, rp.action, rp.scope
      from public.role_permissions rp
     where rp.role_id = p_copy_from;

    insert into public.clock_location_rules (role_id, direction, location_ids, note, updated_by)
    select v_id, c.direction, c.location_ids, c.note, auth.uid()
      from public.clock_location_rules c
     where c.role_id = p_copy_from;
  end if;

  return v_id;
end;
$$;

create function public.org_overview()
returns table (kind text, id uuid, name text, description text, key text, active boolean, sort_order integer, people integer)
language sql
stable
set search_path = ''
as $$ select * from app.org_overview(); $$;

create function public.save_department(p_id uuid, p_name text, p_active boolean default true)
returns uuid
language sql
set search_path = ''
as $$ select app.save_department(p_id, p_name, p_active); $$;

create function public.save_role(p_id uuid, p_name text, p_description text default null, p_active boolean default true, p_copy_from uuid default null)
returns uuid
language sql
set search_path = ''
as $$ select app.save_role(p_id, p_name, p_description, p_active, p_copy_from); $$;

revoke execute on function app.assert_super_admin() from public;
revoke execute on function app.org_overview() from public;
revoke execute on function app.save_department(uuid, text, boolean) from public;
revoke execute on function app.save_role(uuid, text, text, boolean, uuid) from public;
revoke execute on function public.org_overview() from public;
revoke execute on function public.save_department(uuid, text, boolean) from public;
revoke execute on function public.save_role(uuid, text, text, boolean, uuid) from public;

grant execute on function app.assert_super_admin() to authenticated;
grant execute on function app.org_overview() to authenticated;
grant execute on function app.save_department(uuid, text, boolean) to authenticated;
grant execute on function app.save_role(uuid, text, text, boolean, uuid) to authenticated;
grant execute on function public.org_overview() to authenticated;
grant execute on function public.save_department(uuid, text, boolean) to authenticated;
grant execute on function public.save_role(uuid, text, text, boolean, uuid) to authenticated;
