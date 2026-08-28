-- Group-level preference: when exactly one (or more) students have a
-- late_pickup exception on a day, let the group choose to consolidate
-- into a single shared late trip instead of always splitting into a
-- normal-time trip + a separate late trip. Default false preserves
-- today's behavior exactly.
alter table carpool_groups add column consolidate_late_pickups boolean not null default false;

-- Per-day opt-out: even when a group consolidates, a specific family may
-- need their kid picked up at the normal time on a specific day (an
-- appointment, an early practice pickup, etc). Reuses the existing
-- student_exceptions mechanism instead of new infrastructure.
alter table student_exceptions drop constraint student_exceptions_exception_type_check;
alter table student_exceptions add constraint student_exceptions_exception_type_check
  check (exception_type = any (array['late_pickup', 'no_ride', 'needs_normal_pickup', 'custom']));
