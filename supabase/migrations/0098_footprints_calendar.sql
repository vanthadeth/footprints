-- Footprints: the Calendar -- tasks, plus everything dated that already
-- lives elsewhere, in one per-person feed.
--
--   * tasks: a to-do for one person (owner_id). Anyone can add their own;
--     a manager can assign one to someone they can see (app.can('visit',
--     'view', owner)). The owner and the creator can edit and tick it; only
--     the creator can delete it.
--   * visits.follow_up_done_at: lets the rep tick off a visit's next
--     appointment / collection by hand.
--   * app.calendar_items(user, from, to): the feed, added automatically --
--       task      tasks.due_date
--       appt      a visit's next_appointment (done once the rep checks in at
--                 that customer on or after the day)
--       collect   the same, when that visit left money owed (Part paid /
--                 Nothing collected), or a call's follow-up when the call was
--                 about payment (Collection purpose, Partially paid, Delay
--                 payment). Done once a later visit or call at that customer
--                 records Paid in full.
--       follow    any other call/note follow-up (customer_posts.follow_up_at)
--       plan      Today's plan stops
--       leave     the person's pending/approved leave, one row per day
--       holiday   public holidays that apply to them, one row per day
--     Security definer (visits RLS hides colleagues' payments, and the
--     caller may be a manager looking at someone else); it checks
--     p_user = auth.uid() or app.can('visit', 'view', p_user) itself.

-- ---------------------------------------------------------------- tasks

create table public.tasks (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.users(id) on delete cascade,
  created_by  uuid not null default auth.uid() references public.users(id),
  title       text not null check (btrim(title) <> '' and char_length(title) <= 200),
  note        text check (char_length(note) <= 2000),
  due_date    date not null,
  due_time    time,
  customer_id uuid references public.customers(id) on delete set null,
  done_at     timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.tasks is
  'A to-do on one person''s calendar (owner_id). created_by = owner for your own tasks, else the manager who assigned it.';

create index tasks_owner_due_idx on public.tasks (owner_id, due_date);
create index tasks_created_by_idx on public.tasks (created_by);
create index tasks_customer_idx on public.tasks (customer_id);

alter table public.tasks enable row level security;

create policy tasks_select on public.tasks for select to authenticated
  using (owner_id = (select auth.uid()) or created_by = (select auth.uid()) or app.can('visit', 'view', owner_id));
create policy tasks_insert on public.tasks for insert to authenticated
  with check (created_by = (select auth.uid()) and (owner_id = (select auth.uid()) or app.can('visit', 'view', owner_id)));
create policy tasks_update on public.tasks for update to authenticated
  using (owner_id = (select auth.uid()) or created_by = (select auth.uid()))
  with check (owner_id = (select auth.uid()) or created_by = (select auth.uid()));
create policy tasks_delete on public.tasks for delete to authenticated
  using (created_by = (select auth.uid()));

grant select, insert, update, delete on public.tasks to authenticated;

-- Security invoker: the RLS above decides who may write.
create function app.save_task(
  p_id uuid,
  p_owner uuid,
  p_title text,
  p_due_date date,
  p_due_time time default null,
  p_note text default null,
  p_customer uuid default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if btrim(coalesce(p_title, '')) = '' then
    raise exception 'invalid_input' using detail = 'A task needs a title.';
  end if;
  if p_due_date is null then
    raise exception 'invalid_input' using detail = 'A task needs a date.';
  end if;

  if p_id is null then
    insert into public.tasks (owner_id, title, note, due_date, due_time, customer_id)
    values (coalesce(p_owner, auth.uid()), btrim(p_title), nullif(btrim(coalesce(p_note, '')), ''), p_due_date, p_due_time, p_customer)
    returning id into v_id;
  else
    update public.tasks
       set title = btrim(p_title), note = nullif(btrim(coalesce(p_note, '')), ''), due_date = p_due_date,
           due_time = p_due_time, customer_id = p_customer, updated_at = now()
     where id = p_id
    returning id into v_id;
    if v_id is null then
      raise exception 'not_found';
    end if;
  end if;
  return v_id;
end;
$$;

create function app.complete_task(p_id uuid, p_done boolean default true)
returns void
language plpgsql
set search_path = ''
as $$
begin
  update public.tasks set done_at = case when p_done then now() end, updated_at = now() where id = p_id;
  if not found then
    raise exception 'not_found';
  end if;
end;
$$;

create function app.delete_task(p_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  delete from public.tasks where id = p_id;
  if not found then
    raise exception 'not_found' using detail = 'Only whoever created a task can delete it.';
  end if;
end;
$$;

-- ---------------------------------------------------------------- visit follow-ups

alter table public.visits add column follow_up_done_at timestamptz;
comment on column public.visits.follow_up_done_at is
  'Set when the rep ticks off this visit''s next appointment / collection on their calendar.';

create function app.complete_visit_follow_up(p_visit uuid, p_done boolean default true)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.visits
     set follow_up_done_at = case when p_done then now() end
   where id = p_visit and user_id = auth.uid();
  if not found then
    raise exception 'not_found' using detail = 'Only your own visits can be ticked off.';
  end if;
end;
$$;

-- ---------------------------------------------------------------- feed

create function app.calendar_items(p_user uuid, p_from date, p_to date)
returns table (
  kind          text,
  ref_id        uuid,
  day           date,
  at_time       time,
  title         text,
  customer_id   uuid,
  customer_name text,
  done          boolean,
  amount        numeric,
  source_date   date,
  source_label  text,
  assigned_by   text,
  can_edit      boolean,
  sort_order    integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me   uuid := auth.uid();
  v_dept uuid;
begin
  if p_user is distinct from v_me and not app.can('visit', 'view', p_user) then
    raise exception 'insufficient_privilege' using errcode = 'insufficient_privilege',
      detail = 'You can only see your own calendar or your team''s.';
  end if;
  if p_to < p_from or p_to - p_from > 100 then
    raise exception 'invalid_input' using detail = 'Pick a range of up to 100 days.';
  end if;
  select u.department_id into v_dept from public.users u where u.id = p_user;

  return query
  -- Tasks
  select 'task'::text, t.id, t.due_date, t.due_time, t.title, t.customer_id, c.shop_name,
         t.done_at is not null, null::numeric, t.created_at::date, t.note,
         case when t.created_by <> t.owner_id then coalesce(nullif(btrim(cb.nickname), ''), cb.full_name) end,
         (t.owner_id = v_me or t.created_by = v_me), 0
    from public.tasks t
    left join public.customers c on c.id = t.customer_id
    left join public.users cb on cb.id = t.created_by
   where t.owner_id = p_user and t.due_date between p_from and p_to

  union all
  -- A visit's next appointment; a collection when it left money owed.
  select case when ps.label in ('Part paid', 'Nothing collected') then 'collect' else 'appt' end,
         v.id,
         (v.next_appointment at time zone 'Asia/Phnom_Penh')::date,
         nullif((v.next_appointment at time zone 'Asia/Phnom_Penh')::time, time '00:00'),
         c.shop_name, v.customer_id, c.shop_name,
         v.follow_up_done_at is not null
           or (ps.label in ('Part paid', 'Nothing collected') and (
                exists (select 1 from public.visits v2 join public.visit_options p2 on p2.id = v2.payment_status_id
                         where v2.customer_id = v.customer_id and v2.cancelled_at is null and v2.checked_in_at > v.checked_in_at and p2.label = 'Paid in full')
             or exists (select 1 from public.customer_posts cp
                         where cp.customer_id = v.customer_id and cp.deleted_at is null and cp.created_at > v.checked_in_at and cp.outcome_payment = 'Paid in full')))
           or (coalesce(ps.label, '') not in ('Part paid', 'Nothing collected') and
                exists (select 1 from public.visits v3
                         where v3.user_id = v.user_id and v3.customer_id = v.customer_id and v3.cancelled_at is null and v3.id <> v.id
                           and (v3.checked_in_at at time zone 'Asia/Phnom_Penh')::date >= (v.next_appointment at time zone 'Asia/Phnom_Penh')::date)),
         case when ps.label in ('Part paid', 'Nothing collected')
              then nullif(greatest(coalesce(v.order_amount_usd, 0) - coalesce(v.collected_usd, 0), 0), 0) end,
         (v.checked_in_at at time zone 'Asia/Phnom_Penh')::date,
         ps.label,
         null::text,
         v.user_id = v_me, 0
    from public.visits v
    join public.customers c on c.id = v.customer_id
    left join public.visit_options ps on ps.id = v.payment_status_id
   where v.user_id = p_user and v.cancelled_at is null and v.next_appointment is not null
     and (v.next_appointment at time zone 'Asia/Phnom_Penh')::date between p_from and p_to

  union all
  -- A call / note follow-up; a collection when the call was about payment.
  select case when 'collection' = any (p.purposes) or p.outcome_payment in ('Partially paid', 'Delay payment') then 'collect' else 'follow' end,
         p.id,
         (p.follow_up_at at time zone 'Asia/Phnom_Penh')::date,
         nullif((p.follow_up_at at time zone 'Asia/Phnom_Penh')::time, time '00:00'),
         coalesce(nullif(left(split_part(btrim(p.body), E'\n', 1), 90), ''), case when p.kind = 'call' then 'Call back' else 'Follow up' end),
         p.customer_id, c.shop_name,
         p.follow_up_done_at is not null
           or (('collection' = any (p.purposes) or p.outcome_payment in ('Partially paid', 'Delay payment')) and (
                exists (select 1 from public.visits v2 join public.visit_options p2 on p2.id = v2.payment_status_id
                         where v2.customer_id = p.customer_id and v2.cancelled_at is null and v2.checked_in_at > p.created_at and p2.label = 'Paid in full')
             or exists (select 1 from public.customer_posts cp
                         where cp.customer_id = p.customer_id and cp.deleted_at is null and cp.created_at > p.created_at and cp.outcome_payment = 'Paid in full'))),
         null::numeric,
         (p.created_at at time zone 'Asia/Phnom_Penh')::date,
         coalesce(p.outcome_payment, p.kind::text),
         null::text,
         p.author_id = v_me, 0
    from public.customer_posts p
    join public.customers c on c.id = p.customer_id
   where p.author_id = p_user and p.deleted_at is null and p.follow_up_at is not null
     and (p.follow_up_at at time zone 'Asia/Phnom_Penh')::date between p_from and p_to

  union all
  -- Today's plan stops
  select 'plan'::text, i.id, i.plan_date, null::time, c.shop_name, i.customer_id, c.shop_name,
         i.status = 'done', null::numeric, null::date, i.source, null::text, false, i.sort_order
    from public.visit_plan_items i
    join public.customers c on c.id = i.customer_id
   where i.user_id = p_user and i.status in ('planned', 'done') and i.plan_date between p_from and p_to

  union all
  -- Leave, one row per day in range
  select 'leave'::text, r.id, g::date, null::time,
         initcap(r.leave_type::text) || ' leave' || case when r.status = 'pending' then ' (waiting for approval)' else '' end,
         null::uuid, null::text, false, null::numeric, null::date, r.status::text, null::text, false, 0
    from public.leave_requests r
    cross join lateral generate_series(greatest(r.start_date, p_from), least(r.end_date, p_to), interval '1 day') g
   where r.user_id = p_user and r.status in ('pending', 'approved') and r.start_date <= p_to and r.end_date >= p_from

  union all
  -- Public holidays that apply to them, one row per day in range
  select 'holiday'::text, h.id, g::date, null::time,
         h.name || case when h.half_day then ' (afternoon)' else '' end,
         null::uuid, null::text, false, null::numeric, null::date, h.kind, null::text, false, 0
    from public.public_holidays h
    cross join lateral generate_series(greatest(h.start_date, p_from), least(h.end_date, p_to), interval '1 day') g
   where h.start_date <= p_to and h.end_date >= p_from
     and (h.department_ids is null or v_dept = any (h.department_ids));
end;
$$;

-- ---------------------------------------------------------------- wrappers

create function public.save_task(p_id uuid, p_owner uuid, p_title text, p_due_date date, p_due_time time default null, p_note text default null, p_customer uuid default null)
returns uuid language sql set search_path = ''
as $$ select app.save_task(p_id, p_owner, p_title, p_due_date, p_due_time, p_note, p_customer); $$;

create function public.complete_task(p_id uuid, p_done boolean default true)
returns void language sql set search_path = ''
as $$ select app.complete_task(p_id, p_done); $$;

create function public.delete_task(p_id uuid)
returns void language sql set search_path = ''
as $$ select app.delete_task(p_id); $$;

create function public.complete_visit_follow_up(p_visit uuid, p_done boolean default true)
returns void language sql set search_path = ''
as $$ select app.complete_visit_follow_up(p_visit, p_done); $$;

create function public.calendar_items(p_user uuid, p_from date, p_to date)
returns table (kind text, ref_id uuid, day date, at_time time, title text, customer_id uuid, customer_name text, done boolean,
               amount numeric, source_date date, source_label text, assigned_by text, can_edit boolean, sort_order integer)
language sql stable set search_path = ''
as $$ select * from app.calendar_items(p_user, p_from, p_to); $$;

revoke execute on function app.save_task(uuid, uuid, text, date, time, text, uuid) from public;
revoke execute on function app.complete_task(uuid, boolean) from public;
revoke execute on function app.delete_task(uuid) from public;
revoke execute on function app.complete_visit_follow_up(uuid, boolean) from public;
revoke execute on function app.calendar_items(uuid, date, date) from public;
revoke execute on function public.save_task(uuid, uuid, text, date, time, text, uuid) from public;
revoke execute on function public.complete_task(uuid, boolean) from public;
revoke execute on function public.delete_task(uuid) from public;
revoke execute on function public.complete_visit_follow_up(uuid, boolean) from public;
revoke execute on function public.calendar_items(uuid, date, date) from public;

grant execute on function app.save_task(uuid, uuid, text, date, time, text, uuid) to authenticated;
grant execute on function app.complete_task(uuid, boolean) to authenticated;
grant execute on function app.delete_task(uuid) to authenticated;
grant execute on function app.complete_visit_follow_up(uuid, boolean) to authenticated;
grant execute on function app.calendar_items(uuid, date, date) to authenticated;
grant execute on function public.save_task(uuid, uuid, text, date, time, text, uuid) to authenticated;
grant execute on function public.complete_task(uuid, boolean) to authenticated;
grant execute on function public.delete_task(uuid) to authenticated;
grant execute on function public.complete_visit_follow_up(uuid, boolean) to authenticated;
grant execute on function public.calendar_items(uuid, date, date) to authenticated;
