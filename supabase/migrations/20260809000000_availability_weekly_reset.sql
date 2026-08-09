alter table parent_availability add column if not exists is_recurring boolean not null default false;

create extension if not exists pg_cron;

create or replace function reset_weekly_availability() returns void as $$
begin
  if extract(dow from (now() at time zone 'America/New_York')) = 0
     and extract(hour from (now() at time zone 'America/New_York')) = 0 then
    delete from parent_availability where is_recurring = false;
  end if;
end;
$$ language plpgsql;

select cron.schedule('weekly-availability-reset', '0 * * * *', 'select reset_weekly_availability();');
