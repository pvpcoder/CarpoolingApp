-- generate-schedule had no rate limiting and no record of who triggered a
-- given call, so cost logs couldn't be attributed and nothing stopped a
-- script (or a buggy client retry loop) from spamming the AI endpoint.
alter table api_usage_logs add column if not exists user_id uuid references auth.users(id);
