-- Tracks whether a driving reminder has already gone out for a given slot,
-- so the every-15-minutes cron job (see send-driving-reminders) never
-- double-sends. Two separate flags since a slot gets two distinct
-- reminders: the evening before, and ~30-60 min before departure same-day.
alter table schedule_slots add column if not exists evening_reminder_sent_at timestamptz;
alter table schedule_slots add column if not exists same_day_reminder_sent_at timestamptz;

create extension if not exists pg_net with schema extensions;
