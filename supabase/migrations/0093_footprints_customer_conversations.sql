-- Footprints: customer conversations -- logged calls and notes on a
-- customer, with replies, reactions, @mentions, follow-ups and a per-user
-- "Messages" read model.
--
--   * Two new roles the call-logging design needs: Sale Admin (office,
--     calls every customer) and Remote Salesperson (a salesperson who
--     calls rather than visits -- their own customers).
--   * One new permission module, customer_conversation. Its owner for
--     app.can() is the customer's owner_id, so 'own' = your own customers,
--     'sub' = your team's, 'any' = everyone's. 'view' lets you read, reply
--     and react; 'add' lets you log a call or note.
--   * Base tables are read through RLS (app.can_view_conversation) and
--     written only through the security definer app.* RPCs below, each with
--     a thin public.* wrapper -- the convention every prior migration here
--     follows. Being @mentioned or notified on a post also makes it
--     visible, so a person pulled into a thread can always open it.
--   * Author/customer display names come from small security definer
--     helpers rather than joins, because public.users / public.customers
--     RLS would otherwise hide them from roles scoped 'own'/'sub'.

-- ---------------------------------------------------------------- roles

insert into public.roles (key, name, description, sort_order) values
  ('sale_admin', 'Sale Admin', 'Office sales admin: calls customers and logs the conversation.', 8),
  ('remote_sales', 'Remote Salesperson', 'Salesperson who works their own customers by phone.', 9);

-- Remote Salesperson: exactly what the Sales Team role has today.
insert into public.role_permissions (role_id, module_key, action, scope)
select (select id from public.roles where key = 'remote_sales'), rp.module_key, rp.action, rp.scope
from public.role_permissions rp
join public.roles r on r.id = rp.role_id
where r.key = 'sales';

-- Sale Admin: office attendance and leave for themselves, and the whole
-- customer book (plus read access to what they need to answer a customer).
insert into public.role_permissions (role_id, module_key, action, scope)
select (select id from public.roles where key = 'sale_admin'), v.module_key, v.action::public.permission_action, v.scope::public.permission_scope
from (values
  ('attendance', 'view', 'own'),
  ('attendance', 'add', 'own'),
  ('attendance', 'edit', 'own'),
  ('customer', 'view', 'any'),
  ('customer', 'add', 'any'),
  ('customer', 'edit', 'any'),
  ('product', 'view', 'any'),
  ('sale_order', 'view', 'any'),
  ('invoice', 'view', 'any'),
  ('payment', 'view', 'any'),
  ('user', 'view', 'any'),
  ('leave', 'view', 'own'),
  ('leave', 'add', 'own'),
  ('leave', 'edit', 'own'),
  ('leave_balance', 'view', 'own')
) as v(module_key, action, scope);

-- ---------------------------------------------------------------- module

insert into public.modules (key, name, icon, href, sort_order, active, group_name) values
  ('customer_conversation', 'Customer conversations', 'message-circle', 'messages', 17, true, 'Selling');

insert into public.role_permissions (role_id, module_key, action, scope)
select r.id, 'customer_conversation', v.action::public.permission_action, v.scope::public.permission_scope
from public.roles r
join (values
  ('sales', 'view', 'any'), ('sales', 'add', 'own'),
  ('remote_sales', 'view', 'any'), ('remote_sales', 'add', 'own'),
  ('sale_admin', 'view', 'any'), ('sale_admin', 'add', 'any'),
  ('sales_supervisor', 'view', 'any'), ('sales_supervisor', 'add', 'sub'),
  ('sales_manager', 'view', 'any'), ('sales_manager', 'add', 'any'),
  ('system_admin', 'view', 'any'), ('system_admin', 'add', 'any'),
  ('accounting', 'view', 'any'),
  ('warehouse', 'view', 'any'),
  ('hr', 'view', 'any')
) as v(role_key, action, scope) on v.role_key = r.key;

-- ---------------------------------------------------------------- types

create type public.conversation_kind as enum ('call', 'note');
create type public.call_direction as enum ('outgoing', 'incoming');
create type public.call_purpose as enum ('care', 'delivery', 'discount', 'collection', 'followup', 'conflict');

-- ---------------------------------------------------------------- tables

create table public.customer_posts (
  id                 uuid primary key default gen_random_uuid(),
  customer_id        uuid not null references public.customers(id) on delete cascade,
  author_id          uuid not null references public.users(id),
  kind               public.conversation_kind not null,
  direction          public.call_direction,
  purposes           public.call_purpose[] not null default '{}',
  body               text not null default '',
  outcome_payment    text check (outcome_payment in ('Paid in full', 'Partially paid', 'Delay payment', 'Denied to pay', 'Notify only')),
  outcome_order      text check (outcome_order in ('Ordered', 'Will order', 'No order')),
  outcome_delivery   text check (outcome_delivery in ('Confirmed', 'Will check', 'Not yet received', 'Lost', 'Dispute')),
  outcome_conflict   text check (outcome_conflict in ('Critical', 'Moderate', 'Mild', 'Resolved')),
  follow_up_at       timestamptz,
  follow_up_done_at  timestamptz,
  created_at         timestamptz not null default now(),
  edited_at          timestamptz,
  deleted_at         timestamptz,
  constraint customer_posts_call_shape check (
    (kind = 'call' and direction is not null and cardinality(purposes) > 0)
    or (kind = 'note' and direction is null)
  ),
  constraint customer_posts_body_len check (char_length(body) <= 4000)
);

create index customer_posts_customer_idx on public.customer_posts (customer_id, created_at desc);
create index customer_posts_author_idx on public.customer_posts (author_id, created_at desc);
create index customer_posts_follow_up_idx on public.customer_posts (author_id, follow_up_at) where follow_up_at is not null and follow_up_done_at is null;

create table public.customer_post_replies (
  id           uuid primary key default gen_random_uuid(),
  post_id      uuid not null references public.customer_posts(id) on delete cascade,
  author_id    uuid not null references public.users(id),
  reply_to_id  uuid references public.customer_post_replies(id) on delete set null,
  body         text not null check (char_length(body) between 1 and 4000),
  created_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

create index customer_post_replies_post_idx on public.customer_post_replies (post_id, created_at);

create table public.customer_post_reactions (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references public.customer_posts(id) on delete cascade,
  reply_id    uuid references public.customer_post_replies(id) on delete cascade,
  user_id     uuid not null references public.users(id),
  reaction    text not null check (reaction in ('like', 'noted', 'follow', 'thanks')),
  created_at  timestamptz not null default now(),
  constraint customer_post_reactions_unique unique nulls not distinct (post_id, reply_id, user_id, reaction)
);

create index customer_post_reactions_post_idx on public.customer_post_reactions (post_id);

create table public.conversation_mentions (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references public.customer_posts(id) on delete cascade,
  reply_id    uuid references public.customer_post_replies(id) on delete cascade,
  user_id     uuid not null references public.users(id),
  reason      text not null default 'mention' check (reason in ('mention', 'notify')),
  created_by  uuid not null references public.users(id),
  created_at  timestamptz not null default now(),
  constraint conversation_mentions_unique unique nulls not distinct (post_id, reply_id, user_id)
);

create index conversation_mentions_user_idx on public.conversation_mentions (user_id, post_id);

create table public.conversation_reads (
  user_id       uuid not null references public.users(id) on delete cascade,
  post_id       uuid not null references public.customer_posts(id) on delete cascade,
  last_read_at  timestamptz not null default now(),
  primary key (user_id, post_id)
);

-- ---------------------------------------------------------------- helpers

create function app.conversation_customer_owner(p_customer uuid)
returns uuid
language sql
stable
security definer
set search_path to ''
as $function$ select c.owner_id from public.customers c where c.id = p_customer; $function$;

comment on function app.conversation_customer_owner is
  'A customer''s owner_id regardless of the caller''s customer RLS -- the owner that customer_conversation permissions are scoped against.';

create function app.can_view_conversation(p_post uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists (
    select 1 from public.customer_posts p
     where p.id = p_post
       and p.deleted_at is null
       and (
         app.can('customer_conversation', 'view', app.conversation_customer_owner(p.customer_id))
         or exists (select 1 from public.conversation_mentions m where m.post_id = p.id and m.user_id = auth.uid())
       )
  );
$function$;

comment on function app.can_view_conversation is
  'True when the caller may read (and so reply to / react on) this post: customer_conversation view on the customer''s owner, or being mentioned/notified anywhere on it.';

create function app.conversation_customer_name(p_customer uuid)
returns text
language sql
stable
security definer
set search_path to ''
as $function$ select c.shop_name from public.customers c where c.id = p_customer; $function$;

create function app.conversation_user_name(p_user uuid)
returns text
language sql
stable
security definer
set search_path to ''
as $function$ select coalesce(nullif(btrim(u.nickname), ''), u.full_name) from public.users u where u.id = p_user; $function$;

comment on function app.conversation_user_name is
  'Display name (nickname, else full name) for authors in conversation read models -- users RLS would hide colleagues from own-scoped roles.';

-- ---------------------------------------------------------------- RLS

alter table public.customer_posts enable row level security;
alter table public.customer_post_replies enable row level security;
alter table public.customer_post_reactions enable row level security;
alter table public.conversation_mentions enable row level security;
alter table public.conversation_reads enable row level security;

create policy customer_posts_select on public.customer_posts
  for select to authenticated using (app.can_view_conversation(id));

create policy customer_post_replies_select on public.customer_post_replies
  for select to authenticated using (app.can_view_conversation(post_id));

create policy customer_post_reactions_select on public.customer_post_reactions
  for select to authenticated using (app.can_view_conversation(post_id));

create policy conversation_mentions_select on public.conversation_mentions
  for select to authenticated using (user_id = (select auth.uid()) or app.can_view_conversation(post_id));

create policy conversation_reads_select on public.conversation_reads
  for select to authenticated using (user_id = (select auth.uid()));
create policy conversation_reads_insert on public.conversation_reads
  for insert to authenticated with check (user_id = (select auth.uid()) and app.can_view_conversation(post_id));
create policy conversation_reads_update on public.conversation_reads
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------- RPCs

create function app.add_conversation_mentions(p_post uuid, p_reply uuid, p_users uuid[], p_reason text)
returns void
language sql
security definer
set search_path to ''
as $function$
  insert into public.conversation_mentions (post_id, reply_id, user_id, reason, created_by)
  select p_post, p_reply, u.id, p_reason, auth.uid()
  from public.users u
  where u.id = any(coalesce(p_users, '{}'))
    and u.id <> auth.uid()
    and u.status = 'active'
  on conflict on constraint conversation_mentions_unique do nothing;
$function$;

create function app.log_customer_post(
  p_customer_id       uuid,
  p_kind              public.conversation_kind,
  p_direction         public.call_direction default null,
  p_purposes          public.call_purpose[] default '{}',
  p_body              text default '',
  p_outcome_payment   text default null,
  p_outcome_order     text default null,
  p_outcome_delivery  text default null,
  p_outcome_conflict  text default null,
  p_follow_up_at      timestamptz default null,
  p_notify            uuid[] default '{}',
  p_mentions          uuid[] default '{}'
)
returns public.customer_posts
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_me  uuid := auth.uid();
  v_row public.customer_posts;
begin
  if not exists (select 1 from public.customers where id = p_customer_id) then
    raise exception 'not_found';
  end if;
  if not app.can('customer_conversation', 'add', app.conversation_customer_owner(p_customer_id)) then
    raise exception 'insufficient_privilege' using detail = 'You can''t log calls or notes for this customer.';
  end if;
  if p_kind = 'note' and btrim(coalesce(p_body, '')) = '' then
    raise exception 'invalid_input' using detail = 'A note needs some text.';
  end if;
  if p_follow_up_at is not null and p_follow_up_at < now() - interval '1 minute' then
    raise exception 'invalid_input' using detail = 'A follow-up must be in the future.';
  end if;

  insert into public.customer_posts (
    customer_id, author_id, kind, direction, purposes, body,
    outcome_payment, outcome_order, outcome_delivery, outcome_conflict, follow_up_at
  ) values (
    p_customer_id, v_me, p_kind,
    case when p_kind = 'call' then p_direction end,
    coalesce(p_purposes, '{}'),
    btrim(coalesce(p_body, '')),
    p_outcome_payment, p_outcome_order, p_outcome_delivery, p_outcome_conflict, p_follow_up_at
  )
  returning * into v_row;

  perform app.add_conversation_mentions(v_row.id, null, p_mentions, 'mention');
  perform app.add_conversation_mentions(v_row.id, null, p_notify, 'notify');

  insert into public.conversation_reads (user_id, post_id, last_read_at) values (v_me, v_row.id, now())
  on conflict (user_id, post_id) do update set last_read_at = excluded.last_read_at;

  return v_row;
end;
$function$;

comment on function app.log_customer_post is
  'Logs a call (direction + at least one purpose) or a note on a customer, with optional outcomes, a follow-up time, and people to notify/mention. Needs customer_conversation add on the customer''s owner.';

create function app.add_conversation_reply(p_post_id uuid, p_body text, p_reply_to_id uuid default null, p_mentions uuid[] default '{}')
returns public.customer_post_replies
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_me  uuid := auth.uid();
  v_row public.customer_post_replies;
begin
  if not app.can_view_conversation(p_post_id) then
    raise exception 'insufficient_privilege';
  end if;
  if btrim(coalesce(p_body, '')) = '' then
    raise exception 'invalid_input' using detail = 'A reply needs some text.';
  end if;
  if p_reply_to_id is not null and not exists (
    select 1 from public.customer_post_replies r where r.id = p_reply_to_id and r.post_id = p_post_id
  ) then
    raise exception 'invalid_input' using detail = 'That reply belongs to a different conversation.';
  end if;

  insert into public.customer_post_replies (post_id, author_id, reply_to_id, body)
  values (p_post_id, v_me, p_reply_to_id, btrim(p_body))
  returning * into v_row;

  perform app.add_conversation_mentions(p_post_id, v_row.id, p_mentions, 'mention');

  insert into public.conversation_reads (user_id, post_id, last_read_at) values (v_me, p_post_id, now())
  on conflict (user_id, post_id) do update set last_read_at = excluded.last_read_at;

  return v_row;
end;
$function$;

comment on function app.add_conversation_reply is
  'Replies on a conversation the caller can see, optionally to a specific earlier reply, @mentioning people.';

create function app.toggle_conversation_reaction(p_post_id uuid, p_reaction text, p_reply_id uuid default null)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_me uuid := auth.uid();
begin
  if not app.can_view_conversation(p_post_id) then
    raise exception 'insufficient_privilege';
  end if;
  if p_reply_id is not null and not exists (
    select 1 from public.customer_post_replies r where r.id = p_reply_id and r.post_id = p_post_id
  ) then
    raise exception 'invalid_input';
  end if;

  delete from public.customer_post_reactions
   where post_id = p_post_id and reply_id is not distinct from p_reply_id and user_id = v_me and reaction = p_reaction;
  if found then
    return false;
  end if;

  insert into public.customer_post_reactions (post_id, reply_id, user_id, reaction)
  values (p_post_id, p_reply_id, v_me, p_reaction);
  return true;
end;
$function$;

comment on function app.toggle_conversation_reaction is
  'Adds the caller''s reaction to a post (or one of its replies), or removes it if already there. Returns true when the reaction is now on.';

create function app.complete_follow_up(p_post_id uuid, p_done boolean default true)
returns public.customer_posts
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_row public.customer_posts;
begin
  select * into v_row from public.customer_posts where id = p_post_id and deleted_at is null;
  if not found then
    raise exception 'not_found';
  end if;
  if v_row.author_id <> auth.uid() then
    raise exception 'insufficient_privilege' using detail = 'Only the person who set the follow-up can complete it.';
  end if;
  update public.customer_posts
     set follow_up_done_at = case when p_done then now() end
   where id = p_post_id
  returning * into v_row;
  return v_row;
end;
$function$;

create function app.can_log_conversation(p_customer_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$ select app.can('customer_conversation', 'add', app.conversation_customer_owner(p_customer_id)); $function$;

comment on function app.can_log_conversation is
  'Whether the caller may log a call or note on this customer -- lets the UI hide Log call instead of failing on save.';

create function app.mentionable_users()
returns table (id uuid, full_name text, nickname text, photo_path text, role_key text, role_name text)
language sql
stable
security definer
set search_path to ''
as $function$
  select u.id, u.full_name, u.nickname, u.photo_path, r.key, r.name
  from public.users u
  left join public.roles r on r.id = u.role_id
  where u.status = 'active'
    and auth.uid() is not null
  order by coalesce(nullif(btrim(u.nickname), ''), u.full_name);
$function$;

comment on function app.mentionable_users is
  'Active colleagues for the @mention picker and notify chips: name, photo and role only.';

-- ---------------------------------------------------------------- read models

create view public.customer_conversation_feed
  with (security_invoker = true)
  as
  select
    p.id,
    p.customer_id,
    app.conversation_customer_name(p.customer_id) as customer_name,
    app.conversation_customer_owner(p.customer_id) as customer_owner_id,
    p.author_id,
    app.conversation_user_name(p.author_id) as author_name,
    p.kind,
    p.direction,
    p.purposes,
    p.body,
    p.outcome_payment,
    p.outcome_order,
    p.outcome_delivery,
    p.outcome_conflict,
    p.follow_up_at,
    p.follow_up_done_at,
    p.created_at,
    (select count(*) from public.customer_post_replies r where r.post_id = p.id and r.deleted_at is null)::integer as reply_count,
    coalesce((
      select jsonb_object_agg(x.reaction, x.n)
      from (select reaction, count(*) as n from public.customer_post_reactions
             where post_id = p.id and reply_id is null group by reaction) x
    ), '{}'::jsonb) as reaction_counts,
    coalesce((
      select array_agg(reaction order by reaction) from public.customer_post_reactions
       where post_id = p.id and reply_id is null and user_id = (select auth.uid())
    ), '{}') as my_reactions,
    coalesce((
      select jsonb_agg(jsonb_build_object('user_id', m.user_id, 'name', app.conversation_user_name(m.user_id), 'reason', m.reason) order by m.created_at)
      from public.conversation_mentions m where m.post_id = p.id and m.reply_id is null
    ), '[]'::jsonb) as notified
  from public.customer_posts p
  where p.deleted_at is null;

comment on view public.customer_conversation_feed is
  'Posts with customer/author names, reply count, reaction counts, the caller''s own reactions and who was notified. Scoped by customer_posts RLS.';

create view public.customer_conversation_replies
  with (security_invoker = true)
  as
  select
    r.id,
    r.post_id,
    r.author_id,
    app.conversation_user_name(r.author_id) as author_name,
    r.reply_to_id,
    (select app.conversation_user_name(t.author_id) from public.customer_post_replies t where t.id = r.reply_to_id) as reply_to_name,
    r.body,
    r.created_at,
    coalesce((
      select jsonb_object_agg(x.reaction, x.n)
      from (select reaction, count(*) as n from public.customer_post_reactions
             where reply_id = r.id group by reaction) x
    ), '{}'::jsonb) as reaction_counts,
    coalesce((
      select array_agg(reaction order by reaction) from public.customer_post_reactions
       where reply_id = r.id and user_id = (select auth.uid())
    ), '{}') as my_reactions,
    exists (select 1 from public.conversation_mentions m where m.reply_id = r.id and m.user_id = (select auth.uid())) as mentions_me
  from public.customer_post_replies r
  where r.deleted_at is null;

comment on view public.customer_conversation_replies is
  'Replies with author names, the name being replied to, reaction counts, the caller''s reactions and whether it mentions the caller.';

-- One row per conversation that concerns the caller, with the reason it
-- shows up (priority: mentioned > replied to you > your customer > your
-- follow-up is due), the latest message and how many messages from other
-- people arrived since the caller last read it.
create view public.my_conversation_threads
  with (security_invoker = true)
  as
  with me as (select auth.uid() as id),
  flags as (
    select
      p.*,
      exists (select 1 from public.conversation_mentions m, me where m.post_id = p.id and m.user_id = me.id) as f_mention,
      exists (
        select 1 from public.customer_post_replies r, me
         where r.post_id = p.id and r.deleted_at is null and r.author_id <> me.id
           and (
             p.author_id = me.id
             or exists (select 1 from public.customer_post_replies t where t.id = r.reply_to_id and t.author_id = me.id)
           )
      ) as f_reply,
      exists (
        select 1 from me
         where app.conversation_customer_owner(p.customer_id) = me.id
           and (p.author_id <> me.id or exists (select 1 from public.customer_post_replies r where r.post_id = p.id and r.author_id <> me.id and r.deleted_at is null))
      ) as f_mine,
      exists (
        select 1 from me
         where p.author_id = me.id and p.follow_up_at is not null and p.follow_up_done_at is null
           and (p.follow_up_at at time zone 'Asia/Phnom_Penh')::date <= (now() at time zone 'Asia/Phnom_Penh')::date
      ) as f_due
    from public.customer_posts p
    where p.deleted_at is null
  )
  select
    f.id as post_id,
    f.customer_id,
    app.conversation_customer_name(f.customer_id) as customer_name,
    f.kind,
    f.direction,
    f.purposes,
    f.outcome_payment,
    f.outcome_order,
    f.outcome_delivery,
    f.outcome_conflict,
    f.follow_up_at,
    case when f.f_mention then 'mention' when f.f_reply then 'reply' when f.f_mine then 'mine' else 'due' end as reason,
    f.f_mention as is_mention,
    f.f_reply as is_reply,
    f.f_mine as is_mine,
    f.f_due as is_due,
    last_msg.author_id as last_author_id,
    app.conversation_user_name(last_msg.author_id) as last_author_name,
    last_msg.body as last_body,
    last_msg.at as last_at,
    (
      (case when f.author_id <> (select id from me) and f.created_at > coalesce(rd.last_read_at, '-infinity') then 1 else 0 end)
      + (select count(*) from public.customer_post_replies r
          where r.post_id = f.id and r.deleted_at is null and r.author_id <> (select id from me)
            and r.created_at > coalesce(rd.last_read_at, '-infinity'))
    )::integer as unread_count
  from flags f
  left join public.conversation_reads rd on rd.post_id = f.id and rd.user_id = (select id from me)
  cross join lateral (
    select x.author_id, x.body, x.at from (
      select f.author_id, f.body, f.created_at as at
      union all
      select r.author_id, r.body, r.created_at from public.customer_post_replies r where r.post_id = f.id and r.deleted_at is null
    ) x order by x.at desc limit 1
  ) last_msg
  where f.f_mention or f.f_reply or f.f_mine or f.f_due;

comment on view public.my_conversation_threads is
  'The caller''s Messages list: conversations where they are mentioned/notified, replied to, the customer is theirs, or their follow-up is due; with latest message and unread count.';

-- ---------------------------------------------------------------- mark read

create function public.mark_conversation_read(p_post_id uuid)
returns void
language sql
security invoker
set search_path to ''
as $function$
  insert into public.conversation_reads (user_id, post_id, last_read_at)
  values (auth.uid(), p_post_id, now())
  on conflict (user_id, post_id) do update set last_read_at = excluded.last_read_at;
$function$;

create function public.mark_all_conversations_read()
returns integer
language sql
security invoker
set search_path to ''
as $function$
  with t as (
    insert into public.conversation_reads (user_id, post_id, last_read_at)
    select auth.uid(), th.post_id, now() from public.my_conversation_threads th where th.unread_count > 0
    on conflict (user_id, post_id) do update set last_read_at = excluded.last_read_at
    returning 1
  )
  select count(*)::integer from t;
$function$;

-- ---------------------------------------------------------------- public wrappers

create function public.log_customer_post(
  p_customer_id uuid, p_kind public.conversation_kind, p_direction public.call_direction default null,
  p_purposes public.call_purpose[] default '{}', p_body text default '',
  p_outcome_payment text default null, p_outcome_order text default null,
  p_outcome_delivery text default null, p_outcome_conflict text default null,
  p_follow_up_at timestamptz default null, p_notify uuid[] default '{}', p_mentions uuid[] default '{}'
)
returns public.customer_posts
language sql
set search_path to ''
as $function$ select * from app.log_customer_post(p_customer_id, p_kind, p_direction, p_purposes, p_body, p_outcome_payment, p_outcome_order, p_outcome_delivery, p_outcome_conflict, p_follow_up_at, p_notify, p_mentions); $function$;

create function public.add_conversation_reply(p_post_id uuid, p_body text, p_reply_to_id uuid default null, p_mentions uuid[] default '{}')
returns public.customer_post_replies
language sql
set search_path to ''
as $function$ select * from app.add_conversation_reply(p_post_id, p_body, p_reply_to_id, p_mentions); $function$;

create function public.toggle_conversation_reaction(p_post_id uuid, p_reaction text, p_reply_id uuid default null)
returns boolean
language sql
set search_path to ''
as $function$ select app.toggle_conversation_reaction(p_post_id, p_reaction, p_reply_id); $function$;

create function public.complete_follow_up(p_post_id uuid, p_done boolean default true)
returns public.customer_posts
language sql
set search_path to ''
as $function$ select * from app.complete_follow_up(p_post_id, p_done); $function$;

create function public.can_log_conversation(p_customer_id uuid)
returns boolean
language sql
stable
set search_path to ''
as $function$ select app.can_log_conversation(p_customer_id); $function$;

create function public.mentionable_users()
returns table (id uuid, full_name text, nickname text, photo_path text, role_key text, role_name text)
language sql
stable
set search_path to ''
as $function$ select * from app.mentionable_users(); $function$;

-- ---------------------------------------------------------------- grants

revoke execute on function app.conversation_customer_owner(uuid) from public;
revoke execute on function app.can_view_conversation(uuid) from public;
revoke execute on function app.conversation_customer_name(uuid) from public;
revoke execute on function app.conversation_user_name(uuid) from public;
revoke execute on function app.add_conversation_mentions(uuid, uuid, uuid[], text) from public;
revoke execute on function app.log_customer_post(uuid, public.conversation_kind, public.call_direction, public.call_purpose[], text, text, text, text, text, timestamptz, uuid[], uuid[]) from public;
revoke execute on function app.add_conversation_reply(uuid, text, uuid, uuid[]) from public;
revoke execute on function app.toggle_conversation_reaction(uuid, text, uuid) from public;
revoke execute on function app.complete_follow_up(uuid, boolean) from public;
revoke execute on function app.mentionable_users() from public;
revoke execute on function app.can_log_conversation(uuid) from public;
revoke execute on function public.can_log_conversation(uuid) from public;
revoke execute on function public.log_customer_post(uuid, public.conversation_kind, public.call_direction, public.call_purpose[], text, text, text, text, text, timestamptz, uuid[], uuid[]) from public;
revoke execute on function public.add_conversation_reply(uuid, text, uuid, uuid[]) from public;
revoke execute on function public.toggle_conversation_reaction(uuid, text, uuid) from public;
revoke execute on function public.complete_follow_up(uuid, boolean) from public;
revoke execute on function public.mentionable_users() from public;
revoke execute on function public.mark_conversation_read(uuid) from public;
revoke execute on function public.mark_all_conversations_read() from public;

-- The read helpers run inside RLS policies and security_invoker views, so
-- the calling role needs EXECUTE on them (app is not an exposed API schema).
grant execute on function app.conversation_customer_owner(uuid) to authenticated;
grant execute on function app.can_view_conversation(uuid) to authenticated;
grant execute on function app.conversation_customer_name(uuid) to authenticated;
grant execute on function app.conversation_user_name(uuid) to authenticated;
grant execute on function app.log_customer_post(uuid, public.conversation_kind, public.call_direction, public.call_purpose[], text, text, text, text, text, timestamptz, uuid[], uuid[]) to authenticated;
grant execute on function app.add_conversation_reply(uuid, text, uuid, uuid[]) to authenticated;
grant execute on function app.toggle_conversation_reaction(uuid, text, uuid) to authenticated;
grant execute on function app.complete_follow_up(uuid, boolean) to authenticated;
grant execute on function app.mentionable_users() to authenticated;
grant execute on function app.can_log_conversation(uuid) to authenticated;
grant execute on function public.can_log_conversation(uuid) to authenticated;
grant execute on function public.log_customer_post(uuid, public.conversation_kind, public.call_direction, public.call_purpose[], text, text, text, text, text, timestamptz, uuid[], uuid[]) to authenticated;
grant execute on function public.add_conversation_reply(uuid, text, uuid, uuid[]) to authenticated;
grant execute on function public.toggle_conversation_reaction(uuid, text, uuid) to authenticated;
grant execute on function public.complete_follow_up(uuid, boolean) to authenticated;
grant execute on function public.mentionable_users() to authenticated;
grant execute on function public.mark_conversation_read(uuid) to authenticated;
grant execute on function public.mark_all_conversations_read() to authenticated;

-- ---------------------------------------------------------------- realtime

alter publication supabase_realtime add table public.customer_posts;
alter publication supabase_realtime add table public.customer_post_replies;
alter publication supabase_realtime add table public.customer_post_reactions;
