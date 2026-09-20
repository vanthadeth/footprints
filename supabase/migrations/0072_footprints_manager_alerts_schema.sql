-- Footprints: schema for manager alerts (late clock-in, late clock-out,
-- idling too long), pushed to managers via LINE.
--
-- Split into its own migration, kept separate from
-- 0073_footprints_manager_alerts.sql, because `alter type ... add value`
-- cannot be used in the same transaction that adds it (a Postgres
-- restriction) -- see the header of 0066_footprints_attendance.sql for the
-- same kind of split precedent (0066/0067/0068) in this repo.
--
-- idle_alert_threshold_minutes and late_clockin_threshold_minutes already
-- exist on public.app_settings (added outside this repo's local migration
-- history) and auto_clockout_grace_minutes already covers "how late past
-- work_end_time before auto clock-out" -- 0073 reads all three directly
-- rather than introducing new config columns.

-- 'late_clock_out' fills the one gap in notification_kind: the existing
-- 'late_clock_in' and 'idling_too_long' values already cover the other two
-- conditions this feature checks.
alter type public.notification_kind add value 'late_clock_out';

-- Lets a manager be reached on LINE. Nullable and admin-set (via the
-- Supabase dashboard/SQL for now, mirroring how `telegram_id` already sits
-- unused/unwired on this table) -- a user with no line_user_id is simply
-- skipped when alerts are pushed out.
alter table public.users add column line_user_id text;

comment on column public.users.line_user_id is
  'LINE Messaging API user ID for this person, used to push manager alerts (late clock-in/out, idling too long) for their reports. Null if not linked.';
