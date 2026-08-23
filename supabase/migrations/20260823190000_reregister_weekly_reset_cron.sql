-- cron.job entries are data, not schema, so they don't come through a
-- schema-only dump/pull. Re-registering here (safe/idempotent — cron.schedule
-- with an existing job name reschedules it rather than duplicating it) keeps
-- this in the tracked migration history so every environment (including any
-- future one seeded from these migrations) actually runs the job, not just
-- has the function it calls.
select cron.schedule('weekly-availability-reset', '0 * * * *', 'select reset_weekly_availability();');
