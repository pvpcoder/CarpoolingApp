-- Same chicken-and-egg gap as members_read (see 20260830007000):
-- availability_insert only requires parent_id = auth.uid() (a newly
-- linked parent can save availability immediately), but availability_read
-- required is_group_member(group_id), which itself requires an existing
-- group_members row with parent_id already set. A parent who saved their
-- availability before ever loading Home (and thus before the "claim this
-- row" step ran) could save successfully and then immediately fail to
-- read it back - looking exactly like the save silently didn't work.

drop policy if exists availability_read on parent_availability;
create policy availability_read on parent_availability for select using (
  is_group_member(group_id) or parent_id = auth.uid()
);
