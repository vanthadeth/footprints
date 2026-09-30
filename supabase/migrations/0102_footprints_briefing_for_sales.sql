-- Footprints — customer briefing for salespeople.
--
-- The salesperson tabs (Calendar · Messages · Check In · Briefing · Hub)
-- put the customer briefing on its own tab, so the three salesperson
-- roles get the same briefing view managers already have (every
-- customer, scope any). Additive and idempotent.

insert into public.role_permissions (role_id, module_key, action, scope)
select r.id, 'customer_briefing', 'view'::public.permission_action, 'any'::public.permission_scope
  from public.roles r
 where r.key in ('sales', 'salesperson_province', 'remote_sales')
   and not exists (
     select 1 from public.role_permissions p
      where p.role_id = r.id and p.module_key = 'customer_briefing' and p.action = 'view'
   );
