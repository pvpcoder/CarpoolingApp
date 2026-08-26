-- A student ended up with two active group_members rows for the same
-- group (one 'admin', one 'member') - likely from an old invite-accept
-- path before Discover excluded already-joined students. The app's
-- isAdmin check uses .single(), which errors on >1 matching row, so the
-- admin silently fell back to non-admin and lost the "Delete group"
-- button.

-- Clear any existing duplicates before the constraint can be added,
-- preferring to keep an 'admin' row over a 'member' row when both exist
-- for the same (group_id, student_id).
delete from group_members gm
where gm.id in (
  select id from (
    select id, row_number() over (
      partition by group_id, student_id
      order by (role = 'admin') desc, joined_at asc
    ) as rn
    from group_members
    where student_id is not null
  ) ranked
  where rn > 1
);

alter table group_members
  add constraint group_members_group_student_unique unique (group_id, student_id);
