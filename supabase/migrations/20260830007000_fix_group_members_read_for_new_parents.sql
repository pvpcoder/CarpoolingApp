-- A parent whose child is already in a group can't see that child's
-- group_members row until the row's parent_id column points at them - but
-- claiming it (home.tsx's loadParentData) requires seeing it first. The
-- read policy only checked is_group_member (which itself requires
-- parent_id already set), so a newly linked parent could never see, let
-- alone claim, their child's row: the group silently never showed up on
-- their side. members_update was already fixed to check
-- parent_student_links directly (see 20260830001000) - members_read needs
-- the same fix.

drop policy if exists members_read on group_members;
create policy members_read on group_members for select using (
  is_group_member(group_id)
  or exists (
    select 1 from parent_student_links psl
    where psl.parent_id = auth.uid() and psl.student_id = group_members.student_id
  )
);
