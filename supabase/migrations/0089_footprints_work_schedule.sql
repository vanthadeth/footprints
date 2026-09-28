-- Footprints: working hours & days (company + team schedules) and public
-- holidays.
--
-- Until now "working hours" was a single work_start_time/work_end_time pair
-- on app_settings, applied to every day of the week. This adds:
--
--   * work_schedules / work_schedule_days -- one COMPANY schedule
--     (department_id null) plus optional TEAM overrides (one per
--     department). Each has a row per ISO weekday (1 = Mon .. 7 = Sun) with
--     is_working, start/end time and break minutes.
--   * public_holidays -- dated days off (single day or a range, optionally a
--     half day = afternoon off, optionally limited to some departments).
--   * app.work_day(user, date) -- THE one place that answers "is this a
--     working day for this person, and what are their hours?". Clock-in,
--     alerts, auto clock-out, leave day counts and attendance summaries all
--     read it (0090/0091), so a team override or a holiday is honoured
--     everywhere at once.
--   * app_settings.late_grace_minutes (minutes after start before a clock-in
--     counts as late -- previously a client-side constant) and
--     attendance_cycle_close_day (the monthly summary's closing day;
--     0 = last day of the month).
--
-- app_settings.work_start_time/work_end_time stay, kept in step with the
-- company schedule by app.save_work_schedule, for anything that still reads
-- them directly.
--
-- Seeded from the live settings: Mon-Fri 08:30-17:00 with a 30 min break
-- (= the 8 h daily_working_hours target), Saturday 08:30-12:00, Sunday off
-- (~44 h, the weekly_working_hours target). Admins adjust it in the app.

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------
alter table public.app_settings
  add column late_grace_minutes integer not null default 5 check (late_grace_minutes between 0 and 120),
  add column attendance_cycle_close_day smallint not null default 20 check (attendance_cycle_close_day between 0 and 28);

comment on column public.app_settings.late_grace_minutes is
  'A clock-in more than this many minutes after the person''s scheduled start counts as late (attendance summaries).';
comment on column public.app_settings.attendance_cycle_close_day is
  'Day of the month the monthly attendance cycle closes on (1-28): closing on the 20th covers the 21st of last month to the 20th. 0 = calendar month.';

-- ---------------------------------------------------------------------------
-- Schedules
-- ---------------------------------------------------------------------------
create table public.work_schedules (
  id            uuid primary key default gen_random_uuid(),
  department_id uuid unique references public.departments(id) on delete cascade,
  break_paid    boolean not null default false,
  updated_at    timestamptz not null default now(),
  updated_by    uuid references public.users(id) default auth.uid()
);

comment on table public.work_schedules is
  'Working-hours schedules: department_id null = the company schedule (exactly one), otherwise a team override for that department. Days live in work_schedule_days.';

create unique index work_schedules_one_company on public.work_schedules ((department_id is null)) where department_id is null;
create index work_schedules_updated_by_idx on public.work_schedules (updated_by);

create table public.work_schedule_days (
  schedule_id   uuid not null references public.work_schedules(id) on delete cascade,
  iso_dow       smallint not null check (iso_dow between 1 and 7),
  is_working    boolean not null default true,
  start_time    time not null default '08:00',
  end_time      time not null default '17:00',
  break_minutes integer not null default 60 check (break_minutes between 0 and 240),
  primary key (schedule_id, iso_dow),
  constraint work_schedule_days_order check (end_time > start_time)
);

comment on table public.work_schedule_days is
  'One row per ISO weekday (1 = Monday .. 7 = Sunday) of a work_schedules row. Times are Asia/Phnom_Penh wall-clock.';

alter table public.work_schedules enable row level security;
alter table public.work_schedule_days enable row level security;

create policy work_schedules_select on public.work_schedules for select to authenticated using (true);
create policy work_schedules_insert on public.work_schedules for insert to authenticated with check (app.can('settings', 'edit'));
create policy work_schedules_update on public.work_schedules for update to authenticated using (app.can('settings', 'edit')) with check (app.can('settings', 'edit'));
create policy work_schedules_delete on public.work_schedules for delete to authenticated using (app.can('settings', 'edit') and department_id is not null);

create policy work_schedule_days_select on public.work_schedule_days for select to authenticated using (true);
create policy work_schedule_days_insert on public.work_schedule_days for insert to authenticated with check (app.can('settings', 'edit'));
create policy work_schedule_days_update on public.work_schedule_days for update to authenticated using (app.can('settings', 'edit')) with check (app.can('settings', 'edit'));
create policy work_schedule_days_delete on public.work_schedule_days for delete to authenticated using (app.can('settings', 'edit'));

grant select, insert, update, delete on public.work_schedules, public.work_schedule_days to authenticated;

-- Seed the company schedule.
with company as (
  insert into public.work_schedules (department_id, break_paid, updated_by) values (null, false, null) returning id
)
insert into public.work_schedule_days (schedule_id, iso_dow, is_working, start_time, end_time, break_minutes)
select company.id, d.dow, d.working, d.st, d.et, d.brk
  from company,
       (select coalesce((select work_start_time from public.app_settings limit 1), time '08:30') as ws,
               coalesce((select work_end_time from public.app_settings limit 1), time '17:00') as we) s,
       lateral (values
         (1, true, s.ws, s.we, 30),
         (2, true, s.ws, s.we, 30),
         (3, true, s.ws, s.we, 30),
         (4, true, s.ws, s.we, 30),
         (5, true, s.ws, s.we, 30),
         (6, true, s.ws, greatest(s.ws + interval '1 hour', time '12:00'), 0),
         (7, false, s.ws, s.we, 0)
       ) as d(dow, working, st, et, brk);

-- ---------------------------------------------------------------------------
-- Public holidays
-- ---------------------------------------------------------------------------
create table public.public_holidays (
  id             uuid primary key default gen_random_uuid(),
  name           text not null check (btrim(name) <> ''),
  start_date     date not null,
  end_date       date not null,
  kind           text not null default 'public' check (kind in ('public', 'company')),
  half_day       boolean not null default false,
  department_ids uuid[],
  created_by     uuid references public.users(id) default auth.uid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint public_holidays_range check (end_date >= start_date)
);

comment on table public.public_holidays is
  'Days off: a public holiday or a company day off, one date or a range. half_day = the afternoon only. department_ids null = everyone, else only those departments. Never counted as absent/late, and never used from leave allowance.';

create index public_holidays_range_idx on public.public_holidays (start_date, end_date);
create index public_holidays_created_by_idx on public.public_holidays (created_by);

alter table public.public_holidays enable row level security;

create policy public_holidays_select on public.public_holidays for select to authenticated using (true);
create policy public_holidays_insert on public.public_holidays for insert to authenticated
  with check (app.can('settings', 'edit') or app.can('leave_balance', 'edit'));
create policy public_holidays_update on public.public_holidays for update to authenticated
  using (app.can('settings', 'edit') or app.can('leave_balance', 'edit'))
  with check (app.can('settings', 'edit') or app.can('leave_balance', 'edit'));
create policy public_holidays_delete on public.public_holidays for delete to authenticated
  using (app.can('settings', 'edit') or app.can('leave_balance', 'edit'));

grant select, insert, update, delete on public.public_holidays to authenticated;

-- ---------------------------------------------------------------------------
-- app.work_day: the schedule for one person on one date
-- ---------------------------------------------------------------------------
-- Security definer: it reads the person's department and the schedule
-- tables on behalf of callers (clock-in, alerts, summaries) and returns only
-- schedule facts, never anything personal.
create function app.work_day(p_user uuid, p_date date)
returns table (
  is_working     boolean,
  scheduled_day  boolean,
  holiday_id     uuid,
  holiday_name   text,
  holiday_half   boolean,
  start_time     time,
  end_time       time,
  break_minutes  integer,
  break_paid     boolean,
  team_schedule  boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with person as (
    select u.department_id from public.users u where u.id = p_user
  ),
  sched as (
    select s.id, s.break_paid, s.department_id
      from public.work_schedules s
     where s.department_id is null
        or s.department_id = (select department_id from person)
     order by (s.department_id is null)
     limit 1
  ),
  day as (
    select d.* from public.work_schedule_days d
     where d.schedule_id = (select id from sched)
       and d.iso_dow = extract(isodow from p_date)::smallint
  ),
  hol as (
    select h.id, h.name, h.half_day
      from public.public_holidays h
     where p_date between h.start_date and h.end_date
       and (h.department_ids is null or (select department_id from person) = any (h.department_ids))
     order by h.half_day, h.start_date
     limit 1
  ),
  fallback as (
    select coalesce(a.work_start_time, time '08:00') as ws, coalesce(a.work_end_time, time '17:00') as we
      from (select 1) one left join public.app_settings a on true
     limit 1
  )
  select
    coalesce((select is_working from day), extract(isodow from p_date) < 6)
      and not coalesce((select not half_day from hol), false) as is_working,
    coalesce((select is_working from day), extract(isodow from p_date) < 6) as scheduled_day,
    (select id from hol),
    (select name from hol),
    coalesce((select half_day from hol), false),
    coalesce((select start_time from day), (select ws from fallback)),
    case when (select half_day from hol) then least(coalesce((select end_time from day), (select we from fallback)), time '12:00')
         else coalesce((select end_time from day), (select we from fallback)) end,
    case when (select half_day from hol) then 0 else coalesce((select break_minutes from day), 0) end,
    coalesce((select break_paid from sched), false),
    coalesce((select department_id is not null from sched), false);
$$;

comment on function app.work_day is
  'The schedule for p_user on p_date: whether it is a working day (team schedule, else company schedule, minus public holidays -- a half-day holiday keeps the morning), start/end/break, and the holiday if any.';

create function public.my_work_day(p_date date default null)
returns table (
  is_working     boolean,
  scheduled_day  boolean,
  holiday_id     uuid,
  holiday_name   text,
  holiday_half   boolean,
  start_time     time,
  end_time       time,
  break_minutes  integer,
  break_paid     boolean,
  team_schedule  boolean
)
language sql
stable
set search_path = ''
as $$
  select * from app.work_day(auth.uid(), coalesce(p_date, (now() at time zone 'Asia/Phnom_Penh')::date));
$$;

-- Replaces a schedule's settings and all seven days in one go. Security
-- invoker: the RLS above (settings:edit) decides who may write. Saving the
-- company schedule also keeps app_settings.work_start_time/work_end_time in
-- step (earliest working start / latest working end).
create function app.save_work_schedule(p_department uuid, p_break_paid boolean, p_days jsonb)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid;
  v_day jsonb;
begin
  if jsonb_typeof(p_days) <> 'array' or jsonb_array_length(p_days) <> 7 then
    raise exception 'invalid_schedule' using detail = 'A schedule needs exactly seven days.';
  end if;

  if p_department is null then
    select id into v_id from public.work_schedules where department_id is null;
  else
    select id into v_id from public.work_schedules where department_id = p_department;
  end if;

  if v_id is null then
    insert into public.work_schedules (department_id, break_paid) values (p_department, coalesce(p_break_paid, false)) returning id into v_id;
  else
    update public.work_schedules set break_paid = coalesce(p_break_paid, false), updated_at = now(), updated_by = auth.uid() where id = v_id;
  end if;

  for v_day in select * from jsonb_array_elements(p_days) loop
    insert into public.work_schedule_days (schedule_id, iso_dow, is_working, start_time, end_time, break_minutes)
    values (
      v_id,
      (v_day->>'iso_dow')::smallint,
      coalesce((v_day->>'is_working')::boolean, false),
      (v_day->>'start_time')::time,
      (v_day->>'end_time')::time,
      coalesce((v_day->>'break_minutes')::integer, 0)
    )
    on conflict (schedule_id, iso_dow) do update
      set is_working = excluded.is_working,
          start_time = excluded.start_time,
          end_time = excluded.end_time,
          break_minutes = excluded.break_minutes;
  end loop;

  if p_department is null then
    update public.app_settings a
       set work_start_time = coalesce(x.st, a.work_start_time),
           work_end_time = coalesce(x.et, a.work_end_time)
      from (select min(start_time) as st, max(end_time) as et
              from public.work_schedule_days
             where schedule_id = v_id and is_working) x
     where a.id = true;
  end if;

  return v_id;
end;
$$;

create function public.save_work_schedule(p_department uuid, p_break_paid boolean, p_days jsonb)
returns uuid
language sql
set search_path = ''
as $$
  select app.save_work_schedule(p_department, p_break_paid, p_days);
$$;

revoke execute on function app.work_day(uuid, date) from public;
revoke execute on function public.my_work_day(date) from public;
revoke execute on function app.save_work_schedule(uuid, boolean, jsonb) from public;
revoke execute on function public.save_work_schedule(uuid, boolean, jsonb) from public;
grant execute on function app.work_day(uuid, date) to authenticated;
grant execute on function public.my_work_day(date) to authenticated;
grant execute on function app.save_work_schedule(uuid, boolean, jsonb) to authenticated;
grant execute on function public.save_work_schedule(uuid, boolean, jsonb) to authenticated;
