-- Footprints: Leave Management -- module registration + role_permissions seed.
--
-- role_permissions.module_key is FK'd to public.modules (a lookup table
-- this schema already has for its broader admin nav/permission catalog --
-- confirmed live, e.g. 'attendance'/'visit'/'user') -- so the two new
-- module keys below need a modules row each before any role_permissions
-- row can reference them.

insert into public.modules (key, name, icon, href, sort_order, active, group_name) values
  ('leave', 'Leave', 'calendar', 'leave', 15, true, 'Selling'),
  ('leave_balance', 'Leave Balance', 'calendar', 'leave', 16, true, 'Selling');

--
-- Mirrors the existing `attendance` shape exactly (see the role_permissions
-- rows already seeded in the base schema), with one deliberate difference:
-- a manager's 'edit' scope on `leave` is 'sub' rather than 'own', since
-- editing a leave request IS the approve/reject action here (app.can's
-- p_owner = auth.uid() shortcut already covers a manager's own requests
-- for free, so 'sub' alone is enough for both cases).
--
-- is_super_admin users already get 'any' on every module for free via
-- app.effective_scope() -- these System Admin rows are added anyway, same
-- as every other module in this schema, for a person who holds that role
-- without the flag.

insert into public.role_permissions (role_id, module_key, action, scope)
select r.id, v.module_key, v.action::public.permission_action, v.scope::public.permission_scope
from public.roles r
cross join (values
  ('leave', 'view', 'own'),
  ('leave', 'add', 'own'),
  ('leave', 'edit', 'own'),
  ('leave_balance', 'view', 'own')
) as v(module_key, action, scope)
where r.name in ('Sales Team', 'Accounting', 'Warehouse & Logistics');

insert into public.role_permissions (role_id, module_key, action, scope)
select r.id, v.module_key, v.action::public.permission_action, v.scope::public.permission_scope
from public.roles r
cross join (values
  ('leave', 'view', 'sub'),
  ('leave', 'add', 'own'),
  ('leave', 'edit', 'sub'),
  ('leave_balance', 'view', 'sub')
) as v(module_key, action, scope)
where r.name in ('Sale Manager', 'Sale Supervisor');

insert into public.role_permissions (role_id, module_key, action, scope)
select r.id, v.module_key, v.action::public.permission_action, v.scope::public.permission_scope
from public.roles r
cross join (values
  ('leave', 'view', 'any'),
  ('leave', 'add', 'own'),
  ('leave', 'edit', 'any'),
  ('leave_balance', 'view', 'any'),
  ('leave_balance', 'edit', 'any')
) as v(module_key, action, scope)
where r.name = 'HR';

insert into public.role_permissions (role_id, module_key, action, scope)
select r.id, v.module_key, v.action::public.permission_action, v.scope::public.permission_scope
from public.roles r
cross join (values
  ('leave', 'view', 'any'),
  ('leave', 'add', 'any'),
  ('leave', 'edit', 'any'),
  ('leave', 'delete', 'any'),
  ('leave_balance', 'view', 'any'),
  ('leave_balance', 'edit', 'any')
) as v(module_key, action, scope)
where r.name = 'System Admin';
