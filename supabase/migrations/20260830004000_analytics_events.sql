-- Lightweight, self-hosted product analytics: a single append-only events
-- table rather than pulling in a third-party SDK/account before there's
-- traffic to justify one. Good enough to answer "how many people finish
-- signup", "which groups actually generate a schedule", "do swap requests
-- get covered" via SQL in the dashboard; swap-in PostHog/Amplitude later
-- if a richer funnel UI is ever needed.

create table if not exists analytics_events (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  event_name text not null,
  properties jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists analytics_events_name_created_idx on analytics_events (event_name, created_at);
create index if not exists analytics_events_user_idx on analytics_events (user_id);

alter table analytics_events enable row level security;

-- Write-only from the client: anyone signed in can log an event for
-- themselves, but there's no read policy - events are only ever queried
-- from the SQL editor / service role, not read back by the app.
create policy analytics_events_insert on analytics_events for insert with check (
  user_id = auth.uid()
);
