-- Every departure time in the scheduler was hardcoded (7:30 AM morning,
-- 2:45 PM afternoon) with no way for a group to set their own school's
-- actual times. parent_availability already has columns with these exact
-- names that were always just written with the hardcoded constants -
-- this fills in intent the schema already half-expected.
alter table carpool_groups add column morning_departure_time time not null default '07:30:00';
alter table carpool_groups add column afternoon_pickup_time time not null default '14:45:00';
