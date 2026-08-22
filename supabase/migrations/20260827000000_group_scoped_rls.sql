-- Replace "any authenticated user" policies with real group-membership /
-- ownership scoping. Previously any signed-up account could read every
-- group's chat, availability, and schedules, and could rename/delete/modify
-- *any* group, not just their own.
--
-- Helper functions are `security definer` so they can check group_members
-- membership without recursively re-triggering group_members' own RLS.

create or replace function is_group_member(gid uuid) returns boolean
language sql security definer stable set search_path = public, pg_temp as $$
  select exists (
    select 1 from group_members gm
    where gm.group_id = gid
      and gm.status = 'active'
      and (gm.student_id = auth.uid() or gm.parent_id = auth.uid())
  );
$$;

create or replace function is_group_admin(gid uuid) returns boolean
language sql security definer stable set search_path = public, pg_temp as $$
  select exists (
    select 1 from group_members gm
    where gm.group_id = gid
      and gm.status = 'active'
      and gm.role = 'admin'
      and (gm.student_id = auth.uid() or gm.parent_id = auth.uid())
  );
$$;

create or replace function is_parent_account() returns boolean
language sql security definer stable set search_path = public, pg_temp as $$
  select exists (select 1 from parents p where p.id = auth.uid());
$$;

create or replace function shares_group_with(other_user_id uuid) returns boolean
language sql security definer stable set search_path = public, pg_temp as $$
  select exists (
    select 1 from group_members a join group_members b on a.group_id = b.group_id
    where (a.student_id = auth.uid() or a.parent_id = auth.uid())
      and (b.student_id = other_user_id or b.parent_id = other_user_id)
  );
$$;

create or replace function group_id_for_schedule(sid uuid) returns uuid
language sql security definer stable set search_path = public, pg_temp as $$
  select group_id from weekly_schedules where id = sid;
$$;

create or replace function group_id_for_slot(slid uuid) returns uuid
language sql security definer stable set search_path = public, pg_temp as $$
  select ws.group_id from schedule_slots ss join weekly_schedules ws on ws.id = ss.schedule_id where ss.id = slid;
$$;

-- carpool_groups: members can read; also let an invited (not-yet-member)
-- student read the group name so their pending-invite card can show it.
drop policy if exists groups_read on carpool_groups;
create policy groups_read on carpool_groups for select using (
  is_group_member(id)
  or created_by = auth.uid()
  or exists (select 1 from group_invites gi where gi.group_id = carpool_groups.id and gi.invited_student_id = auth.uid())
);

drop policy if exists groups_insert on carpool_groups;
create policy groups_insert on carpool_groups for insert with check (created_by = auth.uid());

drop policy if exists groups_update on carpool_groups;
create policy groups_update on carpool_groups for update using (is_group_admin(id) or created_by = auth.uid());

-- there was no delete policy at all before — this is why "delete group" in
-- my-group.tsx never actually removed the row.
drop policy if exists groups_delete on carpool_groups;
create policy groups_delete on carpool_groups for delete using (is_group_admin(id) or created_by = auth.uid());

-- group_members
drop policy if exists members_read on group_members;
create policy members_read on group_members for select using (is_group_member(group_id));

drop policy if exists members_insert on group_members;
create policy members_insert on group_members for insert with check (
  student_id = auth.uid() and (
    exists (select 1 from carpool_groups cg where cg.id = group_members.group_id and cg.created_by = auth.uid())
    or exists (select 1 from group_invites gi where gi.group_id = group_members.group_id and gi.invited_student_id = auth.uid() and gi.status = 'accepted')
  )
);

drop policy if exists members_update on group_members;
create policy members_update on group_members for update using (
  student_id = auth.uid()
  or parent_id = auth.uid()
  or exists (select 1 from parents p where p.id = auth.uid() and p.student_id = group_members.student_id)
) with check (
  parent_id = auth.uid() or parent_id is null or student_id = auth.uid()
);

drop policy if exists members_delete on group_members;
create policy members_delete on group_members for delete using (
  student_id = auth.uid() or parent_id = auth.uid() or is_group_admin(group_id)
);

-- group_invites
drop policy if exists invites_read on group_invites;
create policy invites_read on group_invites for select using (
  invited_by = auth.uid() or invited_student_id = auth.uid()
);

drop policy if exists invites_insert on group_invites;
create policy invites_insert on group_invites for insert with check (
  invited_by = auth.uid() and is_group_member(group_id)
);

drop policy if exists invites_update on group_invites;
create policy invites_update on group_invites for update using (invited_student_id = auth.uid());

drop policy if exists invites_delete on group_invites;
create policy invites_delete on group_invites for delete using (
  is_group_admin(group_id) or invited_by = auth.uid()
);

-- group_messages
drop policy if exists messages_read on group_messages;
create policy messages_read on group_messages for select using (is_group_member(group_id));

drop policy if exists messages_insert on group_messages;
create policy messages_insert on group_messages for insert with check (
  sender_id = auth.uid() and is_group_member(group_id)
);

-- parent_availability, student_exceptions: writes were already owner-scoped,
-- just tighten reads from "any authenticated user" to group members only.
drop policy if exists availability_read on parent_availability;
create policy availability_read on parent_availability for select using (is_group_member(group_id));

drop policy if exists exceptions_read on student_exceptions;
create policy exceptions_read on student_exceptions for select using (is_group_member(group_id));

-- push_tokens: reads were open to any authenticated user (needed so the
-- client can notify group-mates), scope to "share at least one group" instead.
drop policy if exists tokens_read on push_tokens;
create policy tokens_read on push_tokens for select using (
  user_id = auth.uid() or shares_group_with(user_id)
);

-- schedule_slots, weekly_schedules, swap_requests: scope to group membership,
-- and require a parent account for writes (mirrors the parent-only
-- "generate/regenerate schedule" gate already enforced in the UI).
drop policy if exists schedules_read on weekly_schedules;
create policy schedules_read on weekly_schedules for select using (is_group_member(group_id));

drop policy if exists schedules_insert on weekly_schedules;
create policy schedules_insert on weekly_schedules for insert with check (
  is_group_member(group_id) and is_parent_account()
);

drop policy if exists schedules_delete on weekly_schedules;
create policy schedules_delete on weekly_schedules for delete using (
  is_group_member(group_id) and is_parent_account()
);

drop policy if exists slots_read on schedule_slots;
create policy slots_read on schedule_slots for select using (is_group_member(group_id_for_schedule(schedule_id)));

drop policy if exists slots_insert on schedule_slots;
create policy slots_insert on schedule_slots for insert with check (
  is_group_member(group_id_for_schedule(schedule_id)) and is_parent_account()
);

drop policy if exists slots_update on schedule_slots;
create policy slots_update on schedule_slots for update using (
  is_group_member(group_id_for_schedule(schedule_id)) and is_parent_account()
);

drop policy if exists slots_delete on schedule_slots;
create policy slots_delete on schedule_slots for delete using (
  is_group_member(group_id_for_schedule(schedule_id)) and is_parent_account()
);

drop policy if exists swaps_read on swap_requests;
create policy swaps_read on swap_requests for select using (is_group_member(group_id_for_slot(slot_id)));

drop policy if exists swaps_insert on swap_requests;
create policy swaps_insert on swap_requests for insert with check (
  requesting_parent_id = auth.uid() and is_group_member(group_id_for_slot(slot_id))
);

drop policy if exists swaps_update on swap_requests;
create policy swaps_update on swap_requests for update using (
  is_group_member(group_id_for_slot(slot_id)) and is_parent_account()
);
