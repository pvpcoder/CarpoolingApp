-- students/parents SELECT policies were `true` (fully public, no auth required),
-- exposing every family's name/email/phone/home pickup location to anyone with
-- the app's anon key, no account needed. Require login, matching every other
-- table's read policy.
alter policy students_read on students using (auth.role() = 'authenticated');
alter policy parents_read on parents using (auth.role() = 'authenticated');

-- api_usage_logs had RLS disabled entirely (readable/writable by anyone with
-- the anon key). Only the generate-schedule edge function (service role,
-- which bypasses RLS) needs access; no screen in the app reads this table.
alter table api_usage_logs enable row level security;
