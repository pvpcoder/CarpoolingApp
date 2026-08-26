-- Lets a student or parent subscribe to their carpool schedule from their
-- phone's own calendar app (Apple/Google Calendar "add subscription"),
-- instead of re-exporting an .ics file by hand every week. Calendar apps
-- fetch the feed URL unauthenticated on their own refresh schedule, so the
-- URL itself has to carry an unguessable per-user token rather than relying
-- on a Supabase session.

create extension if not exists pgcrypto with schema extensions;

create table if not exists calendar_feed_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  token text not null unique default encode(extensions.gen_random_bytes(20), 'hex'),
  created_at timestamptz not null default now()
);

alter table calendar_feed_tokens enable row level security;

create policy calendar_feed_tokens_read on calendar_feed_tokens for select using (
  user_id = auth.uid()
);
create policy calendar_feed_tokens_insert on calendar_feed_tokens for insert with check (
  user_id = auth.uid()
);
