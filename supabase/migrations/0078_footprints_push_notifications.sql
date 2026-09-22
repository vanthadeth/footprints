-- Footprints: Web Push for super admins on the existing anomaly notification
-- kinds (late_clock_in, late_clock_out, idling_too_long, ineffective_visit).
-- This is an ADDITIONAL delivery channel -- the in-app bell/Notifications
-- page (public.notifications, notification_feed) is untouched. Push is
-- scoped to users.is_super_admin, the same flag every other super-admin-only
-- screen already gates on.
--
-- Follows the same shape as the Telegram manager-alerts feature
-- (0072-0074_footprints_manager_alerts*): detect server-side (already done,
-- reused as-is here), resolve recipients, external-send via a
-- cron-triggered Edge Function (supabase/functions/push-notify-admins),
-- with DB-side de-dup so an already-sent case is never resent.

-- 1. Per-device Web Push subscriptions. Own-row only (a user
-- subscribes/unsubscribes their own device) -- unlike set_user_telegram_id,
-- this never crosses users, so plain table RLS is enough; no
-- security-definer wrapper function needed.
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

comment on table public.push_subscriptions is
  'Web Push subscriptions (one row per device/browser). A user manages only their own rows; push-notify-admins reads across all super admins'' rows using the service role, which bypasses RLS.';

alter table public.push_subscriptions enable row level security;

create policy push_subscriptions_select on public.push_subscriptions
  for select to authenticated
  using (user_id = auth.uid());

create policy push_subscriptions_insert on public.push_subscriptions
  for insert to authenticated
  with check (user_id = auth.uid());

create policy push_subscriptions_update on public.push_subscriptions
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy push_subscriptions_delete on public.push_subscriptions
  for delete to authenticated
  using (user_id = auth.uid());

-- This environment's migration-apply role grants EXECUTE/table privileges
-- to PUBLIC by default (see 0068's comment) -- narrow to authenticated.
revoke all on public.push_subscriptions from public;
grant select, insert, update, delete on public.push_subscriptions to authenticated;
grant all on public.push_subscriptions to service_role;

-- 2. Marks when a notification row has already been fanned out to push --
-- additive, nullable; existing rows are simply "not yet pushed".
alter table public.notifications add column if not exists pushed_at timestamptz;

-- 3. One row per (unpushed notification x active super-admin subscription)
-- for the Edge Function's cron mode to send and then mark done.
create function app.pending_push_notifications()
returns table (
  notification_id uuid,
  endpoint text,
  p256dh text,
  auth text,
  kind public.notification_kind,
  message text
)
language sql
stable
set search_path to ''
as $function$
  select n.id, ps.endpoint, ps.p256dh, ps.auth, n.kind, n.comment
    from public.notifications n
    cross join public.push_subscriptions ps
    join public.users u on u.id = ps.user_id and u.is_super_admin and u.status = 'active'
   where n.pushed_at is null;
$function$;

comment on function app.pending_push_notifications is
  'One row per (not-yet-pushed notification, active super-admin device) for push-notify-admins to send. Callable only by service_role -- crosses every super admin''s subscriptions, never exposed to authenticated.';

create function public.pending_push_notifications()
returns table (
  notification_id uuid,
  endpoint text,
  p256dh text,
  auth text,
  kind public.notification_kind,
  message text
)
language sql
stable
set search_path to ''
as $function$ select * from app.pending_push_notifications(); $function$;

-- 4. Marks a batch of notifications as pushed once delivery has been
-- attempted to every current super-admin subscription -- called once per
-- cron run, not per subscription, so a case is never re-sent just because
-- one stale subscription in the batch failed.
create function app.mark_notifications_pushed(p_ids uuid[])
returns void
language sql
set search_path to ''
as $function$
  update public.notifications set pushed_at = now() where id = any(p_ids);
$function$;

create function public.mark_notifications_pushed(p_ids uuid[])
returns void
language sql
set search_path to ''
as $function$ select app.mark_notifications_pushed(p_ids); $function$;

revoke execute on function app.pending_push_notifications() from public;
revoke execute on function public.pending_push_notifications() from public;
revoke execute on function app.mark_notifications_pushed(uuid[]) from public;
revoke execute on function public.mark_notifications_pushed(uuid[]) from public;

grant execute on function app.pending_push_notifications() to service_role;
grant execute on function public.pending_push_notifications() to service_role;
grant execute on function app.mark_notifications_pushed(uuid[]) to service_role;
grant execute on function public.mark_notifications_pushed(uuid[]) to service_role;
