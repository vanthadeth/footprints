-- Footprints: the Google Sheet IDs of a user.
--
-- The sale order and customer tabs name a salesperson in ASSIGN_TO (and the
-- customer tab's salesperson column) with whatever the sheet uses: a name like
-- "seyha", or an ID like "9af927a9", often several in one cell ("pheakdey ,
-- seyha"). The sync could only match full names, nicknames and emails, so most
-- synced orders had no user.
--
-- A Super Admin now sets, per user, the IDs that user goes by in the sheet.
-- The sync reads them (service role) and links a customer's owner and an
-- order's user from the first ID in the cell that belongs to an active user.
-- An ID belongs to one user. Stored lower-case and trimmed.
--
-- The table has no policies: nobody reads it directly. The Super Admin reads
-- and writes through the two functions below (the same gate as the Telegram
-- ID), and the sync function uses the service role.

create table public.user_sheet_ids (
  sheet_id   text primary key check (sheet_id = lower(btrim(sheet_id)) and length(sheet_id) between 1 and 64),
  user_id    uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index user_sheet_ids_user_idx on public.user_sheet_ids (user_id);

alter table public.user_sheet_ids enable row level security;
revoke all on public.user_sheet_ids from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Read a user's IDs (Super Admin only)
-- ---------------------------------------------------------------------------
create function app.user_sheet_ids(p_user uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.users where id = auth.uid() and is_super_admin) then
    raise exception 'Only a super admin can see a user''s Google Sheet IDs' using errcode = 'insufficient_privilege';
  end if;
  return coalesce((select array_agg(sheet_id order by sheet_id) from public.user_sheet_ids where user_id = p_user), '{}');
end;
$$;

-- ---------------------------------------------------------------------------
-- Replace a user's IDs (Super Admin only). Trims, lower-cases, drops blanks and
-- repeats; refuses an ID another user already has.
-- ---------------------------------------------------------------------------
create function app.set_user_sheet_ids(p_user uuid, p_ids text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids   text[];
  v_clash record;
begin
  if not exists (select 1 from public.users where id = auth.uid() and is_super_admin) then
    raise exception 'Only a super admin can set a user''s Google Sheet IDs' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from public.users where id = p_user) then
    raise exception 'That user doesn''t exist' using errcode = 'no_data_found';
  end if;

  select coalesce(array_agg(distinct x), '{}')
    into v_ids
    from (select lower(btrim(i)) as x from unnest(coalesce(p_ids, '{}')) as i) t
   where x <> '';

  if cardinality(v_ids) > 20 then
    raise exception 'At most 20 Google Sheet IDs per user' using errcode = 'check_violation';
  end if;
  if exists (select 1 from unnest(v_ids) as x where length(x) > 64) then
    raise exception 'A Google Sheet ID can be at most 64 characters' using errcode = 'check_violation';
  end if;

  select s.sheet_id, coalesce(u.full_name, u.email, 'another user') as owner
    into v_clash
    from public.user_sheet_ids s
    join public.users u on u.id = s.user_id
   where s.sheet_id = any (v_ids) and s.user_id <> p_user
   limit 1;
  if found then
    raise exception 'The ID "%" already belongs to %', v_clash.sheet_id, v_clash.owner using errcode = 'unique_violation';
  end if;

  delete from public.user_sheet_ids where user_id = p_user and not (sheet_id = any (v_ids));
  insert into public.user_sheet_ids (sheet_id, user_id)
  select x, p_user from unnest(v_ids) as x
  on conflict (sheet_id) do nothing;
end;
$$;

-- ---------------------------------------------------------------------------
-- Public wrappers (auth.uid() still resolves to the caller in the definer function)
-- ---------------------------------------------------------------------------
create function public.user_sheet_ids(p_user uuid)
returns text[]
language sql
stable
set search_path = ''
as $$ select app.user_sheet_ids(p_user); $$;

create function public.set_user_sheet_ids(p_user uuid, p_ids text[])
returns void
language sql
set search_path = ''
as $$ select app.set_user_sheet_ids(p_user, p_ids); $$;

revoke execute on function app.user_sheet_ids(uuid) from public;
revoke execute on function app.set_user_sheet_ids(uuid, text[]) from public;
revoke execute on function public.user_sheet_ids(uuid) from public;
revoke execute on function public.set_user_sheet_ids(uuid, text[]) from public;
grant execute on function app.user_sheet_ids(uuid) to authenticated;
grant execute on function app.set_user_sheet_ids(uuid, text[]) to authenticated;
grant execute on function public.user_sheet_ids(uuid) to authenticated;
grant execute on function public.set_user_sheet_ids(uuid, text[]) to authenticated;
