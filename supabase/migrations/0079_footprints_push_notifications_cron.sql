-- Footprints: schedule the push-notify-admins fan-out every 5 minutes,
-- same pattern as 0074_footprints_manager_alerts_cron.sql -- read that
-- file's header for the full explanation of why the auth header is built
-- this way (a Vault-stored service_role key, never a migration-embedded
-- secret).
--
-- REQUIRED MANUAL STEPS (same rule as 0074 -- never commit a secret to a
-- migration file):
--
--   1. The 'service_role_key' Vault secret this job's Authorization header
--      reads is the SAME one 0074's job already needs -- if that's already
--      set up, skip this step entirely.
--
--   2. Deploy the Edge Function and give it its VAPID secrets:
--        supabase functions deploy push-notify-admins
--        supabase secrets set VAPID_PUBLIC_KEY=<the VAPID public key>
--        supabase secrets set VAPID_PRIVATE_KEY=<the VAPID private key>
--        supabase secrets set VAPID_SUBJECT=mailto:<a real contact address>
--
-- Without step 1, this cron job's HTTP call has no Authorization header the
-- Edge Function will accept -- check `select * from cron.job_run_details
-- order by start_time desc limit 5;` after applying if pushes don't show up.

select cron.schedule(
  'push-notify-admins',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://wbyrluggvuvnhxzfaeye.supabase.co/functions/v1/push-notify-admins',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1)
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);
