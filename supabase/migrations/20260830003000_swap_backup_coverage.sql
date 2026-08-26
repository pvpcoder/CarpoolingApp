-- swap_requests let any group parent race to "cover" a slot via an
-- unconditional client-side UPDATE - two parents tapping Cover at the same
-- moment could both believe they got it, with the last write silently
-- winning. Move claiming into an atomic RPC, and add a backup/waitlist so
-- if the covering parent later can't drive after all, the earliest backup
-- volunteer is promoted automatically instead of the slot just reverting to
-- uncovered with no one told.

alter table swap_requests add column if not exists escalated_at timestamptz;

create table if not exists swap_volunteers (
  id uuid primary key default gen_random_uuid(),
  swap_request_id uuid not null references swap_requests(id) on delete cascade,
  parent_id uuid not null references parents(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (swap_request_id, parent_id)
);

alter table swap_volunteers enable row level security;

create or replace function group_id_for_swap(sid uuid) returns uuid
    language sql stable security definer
    set search_path to 'public', 'pg_temp'
    as $$
  select group_id_for_slot(slot_id) from swap_requests where id = sid;
$$;

create policy volunteers_read on swap_volunteers for select using (
  is_group_member(group_id_for_swap(swap_request_id))
);
create policy volunteers_insert on swap_volunteers for insert with check (
  parent_id = auth.uid() and is_group_member(group_id_for_swap(swap_request_id)) and is_parent_account()
);
create policy volunteers_delete on swap_volunteers for delete using (
  parent_id = auth.uid()
);

-- Atomically claims an open swap request. Raises 'already_covered' if
-- someone else claimed it first (checked and updated in one statement, so
-- there's no window for two concurrent callers to both succeed).
create or replace function claim_swap(swap_id uuid) returns void
    language plpgsql security definer
    set search_path to 'public', 'pg_temp'
    as $$
declare
  v_slot_id uuid;
  v_requesting_parent_id uuid;
  v_group_id uuid;
  v_updated_id uuid;
begin
  select slot_id, requesting_parent_id into v_slot_id, v_requesting_parent_id
  from swap_requests where id = swap_id;

  if v_slot_id is null then
    raise exception 'swap_not_found';
  end if;

  v_group_id := group_id_for_slot(v_slot_id);
  if not is_group_member(v_group_id) or not is_parent_account() then
    raise exception 'not_authorized';
  end if;
  if v_requesting_parent_id = auth.uid() then
    raise exception 'cannot_cover_own_request';
  end if;

  update swap_requests
  set covering_parent_id = auth.uid(), status = 'covered'
  where id = swap_id and status = 'open'
  returning id into v_updated_id;

  if v_updated_id is null then
    raise exception 'already_covered';
  end if;

  update schedule_slots set driver_parent_id = auth.uid(), status = 'swapped' where id = v_slot_id;
  delete from swap_volunteers where swap_request_id = swap_id and parent_id = auth.uid();
end;
$$;

-- Lets the covering parent back out. Promotes the earliest backup
-- volunteer if one signed up while the slot was already covered;
-- otherwise reopens the request so it's visible to everyone again.
create or replace function release_swap(swap_id uuid) returns void
    language plpgsql security definer
    set search_path to 'public', 'pg_temp'
    as $$
declare
  v_slot_id uuid;
  v_covering_parent_id uuid;
  v_next_volunteer uuid;
begin
  select slot_id, covering_parent_id into v_slot_id, v_covering_parent_id
  from swap_requests where id = swap_id;

  if v_slot_id is null then
    raise exception 'swap_not_found';
  end if;
  if v_covering_parent_id is distinct from auth.uid() then
    raise exception 'not_authorized';
  end if;

  select parent_id into v_next_volunteer
  from swap_volunteers
  where swap_request_id = swap_id
  order by created_at asc
  limit 1;

  if v_next_volunteer is not null then
    update swap_requests set covering_parent_id = v_next_volunteer where id = swap_id;
    update schedule_slots set driver_parent_id = v_next_volunteer, status = 'swapped' where id = v_slot_id;
    delete from swap_volunteers where swap_request_id = swap_id and parent_id = v_next_volunteer;
  else
    update swap_requests set covering_parent_id = null, status = 'open' where id = swap_id;
    update schedule_slots set driver_parent_id = null, status = 'needs_coverage' where id = v_slot_id;
  end if;
end;
$$;

grant execute on function group_id_for_swap(uuid) to authenticated;
grant execute on function claim_swap(uuid) to authenticated;
grant execute on function release_swap(uuid) to authenticated;
