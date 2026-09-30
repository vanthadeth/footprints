-- Footprints: flexible days off balances for managers, HR and Super Admin.
--
-- app.flex_cycle (0100) already lets someone who may view a person's leave
-- or attendance (app.can_see_flex) open that person's cycle. This adds the
-- list: one row per person on flexible days off the caller may see, with
-- the cycle's numbers -- frozen from flex_settlements once settled, else
-- live from app.flex_numbers -- so Hub › Flexible days off is one call.
create function app.flex_team(p_date date default null)
returns table (
  user_id         uuid,
  full_name       text,
  nickname        text,
  department_name text,
  is_flexible     boolean,
  next_from       date,
  cycle_start     date,
  cycle_end       date,
  saturdays       integer,
  sundays         integer,
  allowance       numeric,
  taken           numeric,
  planned         numeric,
  left_days       numeric,
  settled         boolean,
  over_days       numeric,
  annual_days     numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  with c as (
    select * from app.cycle_bounds(coalesce(p_date, (now() at time zone 'Asia/Phnom_Penh')::date))
  ),
  people as (
    select u.id, u.full_name, u.nickname, d.name as department_name,
           app.day_off_mode(u.id, (select cycle_start from c)) = 'flexible' as is_flexible,
           (select min(m.effective_from) from public.day_off_modes m
             where m.user_id = u.id and m.mode = 'flexible' and m.effective_from > (select cycle_start from c)) as next_from
      from public.users u
      left join public.departments d on d.id = u.department_id
     where u.status = 'active'
       and u.id <> auth.uid()
       and exists (select 1 from public.day_off_modes m where m.user_id = u.id and m.mode = 'flexible')
       and app.can_see_flex(u.id)
  )
  select p.id, p.full_name, p.nickname, p.department_name, p.is_flexible,
         case when p.is_flexible then null else p.next_from end,
         c.cycle_start, c.cycle_end,
         coalesce(s.saturdays, n.saturdays, 0),
         coalesce(s.sundays, n.sundays, 0),
         coalesce(s.allowance, n.allowance, 0),
         coalesce(s.requested + s.auto_days, n.requested + n.auto_days, 0),
         case when s.user_id is not null then 0 else coalesce(n.planned, 0) end,
         case when s.user_id is not null then s.allowance - s.requested - s.auto_days
              else coalesce(n.allowance - n.requested - n.auto_days - n.planned, 0) end,
         s.user_id is not null,
         coalesce(s.over_days, greatest(0, n.requested + n.auto_days + n.planned - n.allowance), 0),
         s.annual_days
    from people p
    cross join c
    left join public.flex_settlements s on s.user_id = p.id and s.cycle_end = c.cycle_end
    left join lateral (select * from app.flex_numbers(p.id, c.cycle_start, c.cycle_end) where p.is_flexible and s.user_id is null) n on true
   where p.is_flexible or p.next_from is not null
   order by p.full_name;
$$;

comment on function app.flex_team is
  'Everyone on flexible days off (or starting it) that the caller may see (app.can_see_flex), with the cycle containing p_date: allowance, taken, planned, left, and the settlement once settled.';

create function public.flex_team(p_date date default null)
returns table (
  user_id uuid, full_name text, nickname text, department_name text, is_flexible boolean, next_from date,
  cycle_start date, cycle_end date, saturdays integer, sundays integer, allowance numeric, taken numeric,
  planned numeric, left_days numeric, settled boolean, over_days numeric, annual_days numeric
)
language sql
stable
set search_path = ''
as $$ select * from app.flex_team(p_date); $$;

revoke execute on function app.flex_team(date) from public;
revoke execute on function public.flex_team(date) from public;
grant execute on function app.flex_team(date) to authenticated;
grant execute on function public.flex_team(date) to authenticated;
