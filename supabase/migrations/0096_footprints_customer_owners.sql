-- Footprints: salespeople who own customers, for the Customer briefing's
-- salesperson picker. Counts only customers the caller may view.

create function app.customer_owners()
returns table (user_id uuid, full_name text, nickname text, customers integer)
language sql
stable
security definer
set search_path = ''
as $$
  select c.owner_id, u.full_name, u.nickname, count(*)::integer
    from public.customers c
    join public.users u on u.id = c.owner_id
   where app.can('customer', 'view', c.owner_id)
   group by c.owner_id, u.full_name, u.nickname
   order by count(*) desc, u.full_name;
$$;

create function public.customer_owners()
returns table (user_id uuid, full_name text, nickname text, customers integer)
language sql
stable
set search_path = ''
as $$
  select * from app.customer_owners();
$$;

revoke execute on function app.customer_owners() from public;
revoke execute on function public.customer_owners() from public;
grant execute on function app.customer_owners() to authenticated;
grant execute on function public.customer_owners() to authenticated;
