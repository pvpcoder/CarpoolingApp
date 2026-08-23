-- Production-only: calls this project's own send-driving-reminders function
-- URL directly, so this migration is intentionally NOT applied to staging
-- (it would otherwise make staging's cron trigger real push sends against
-- production data via production's deployed function).
select cron.schedule(
  'send-driving-reminders',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://pjvvxqtndchbhwivgixm.supabase.co/functions/v1/send-driving-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
  $$
);
