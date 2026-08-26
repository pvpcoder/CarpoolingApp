-- Same failure class as the group_members duplicate bug: nothing stopped
-- two weekly_schedules rows existing for the same (group_id,
-- week_start_date), and every read of "this week's schedule" uses
-- .single(), which errors on >1 matching row - a duplicate here would
-- make a group's schedule silently disappear from the app.

delete from weekly_schedules ws
where ws.id in (
  select id from (
    select id, row_number() over (
      partition by group_id, week_start_date
      order by created_at desc
    ) as rn
    from weekly_schedules
  ) ranked
  where rn > 1
);

alter table weekly_schedules
  add constraint weekly_schedules_group_week_unique unique (group_id, week_start_date);
