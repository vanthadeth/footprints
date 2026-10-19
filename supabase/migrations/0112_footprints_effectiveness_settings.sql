-- Footprints: effectiveness settings.
--
-- Effectiveness is visit time that counts (visits shorter than
-- short_visit_threshold_minutes count 0; a longer visit counts at most
-- visit_credit_cap_minutes) over paid time inside the person's own schedule.
-- daily_unique_customer_target is the unique customers expected on a full day
-- (daily_working_hours); a shorter day, such as a half-day Saturday, is
-- scaled by its scheduled hours. The calculation lives in the app
-- (src/features/attendance/efficiency.ts); these are only the numbers.
alter table public.app_settings
  add column visit_credit_cap_minutes      integer not null default 45 check (visit_credit_cap_minutes between 10 and 240),
  add column daily_unique_customer_target  integer not null default 5  check (daily_unique_customer_target between 1 and 50);
