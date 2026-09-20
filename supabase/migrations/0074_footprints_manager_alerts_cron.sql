-- Footprints: schedule the manager-alerts check every 5 minutes.
--
-- This is the first use of pg_cron/pg_net in this repo, so there's no
-- local precedent to follow -- this is the standard Supabase pattern for
-- invoking an Edge Function on a schedule: pg_cron fires, pg_net makes the
-- HTTP call, and the call authenticates with the project's service role
-- key pulled from Supabase Vault (never embedded in a migration file).
--
-- REQUIRED MANUAL STEPS (do these in the Supabase SQL editor directly --
-- never commit a secret to a migration file, same rule this repo already
-- follows for SUPABASE_SERVICE_ROLE_KEY, see README.md):
--
--   1. One-time, if not already present:
--        select vault.create_secret('<the project''s service_role key>', 'service_role_key');
--      (If a secret named 'service_role_key' already exists from another
--      feature, skip this -- it's reused as-is.)
--
--   2. Deploy the new Edge Function and give it the Telegram bot token:
--        supabase functions deploy notify-managers
--        supabase secrets set TELEGRAM_BOT_TOKEN=<the Telegram bot's token, from @BotFather>
--
--   3. Set telegram_id on each manager who should receive alerts
--      (public.users.telegram_id, already present on this table) -- there
--      is no in-app UI for this yet; set it directly for now. It must be
--      the numeric Telegram chat id for that person (e.g. from the bot's
--      /start message via getUpdates), not their @username.
--
-- Without step 1, the cron job's HTTP call has no Authorization header the
-- Edge Function will accept, so nothing fails loudly -- it just silently
-- gets an auth error on every run. Check `select * from cron.job_run_details
-- order by start_time desc limit 5;` after applying if alerts don't show up.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- cron.schedule() re-scheduling an existing job name updates it in place
-- (pg_cron's documented behavior), so this migration is safe to re-apply.
select cron.schedule(
  'attendance-manager-alerts',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://bwwqpmanprorvzreawbe.supabase.co/functions/v1/notify-managers',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1)
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);
