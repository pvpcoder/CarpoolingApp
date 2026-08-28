-- Same chicken-and-egg gap as members_read (20260830007000), one level up.
-- home.tsx's loadParentData selects group_members joined to carpool_groups
-- to find each linked child's group. members_read already lets a newly
-- linked parent see the group_members row, but the embedded
-- carpool_groups join is governed separately by groups_read, which only
-- allowed is_group_member() (requires parent_id already set), the
-- group's creator, or someone with a pending invite - none of which cover
-- a parent who's linked via parent_student_links but hasn't claimed their
-- group_members row yet.
--
-- Because the join came back null, the loop's `if (!group) continue`
-- skipped the group entirely - before it ever reached the "claim this
-- row" update. That's why the group was invisible to the parent AND the
-- student's side kept showing "parent hasn't joined": the claim step
-- that sets parent_id never even ran.

drop policy if exists groups_read on carpool_groups;
create policy groups_read on carpool_groups for select using (
  is_group_member(id)
  or created_by = auth.uid()
  or exists (
    select 1 from group_invites gi
    where gi.group_id = carpool_groups.id and gi.invited_student_id = auth.uid()
  )
  or exists (
    select 1 from group_members gm
    join parent_student_links psl on psl.student_id = gm.student_id
    where gm.group_id = carpool_groups.id
      and gm.status = 'active'
      and psl.parent_id = auth.uid()
  )
);
