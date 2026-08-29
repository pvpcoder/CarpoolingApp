-- Anyone with an account could link themselves as "parent" to any student
-- just by knowing their school email - and school-issued emails often
-- follow a predictable pattern (a student ID), not a secret. Since this
-- app exposes a linked parent to the student's carpool group, schedule,
-- and pickup address, that's a real privacy hole. Fix: a parent's link
-- request no longer takes effect until the student explicitly approves it.

alter table parent_student_links add column status text;
update parent_student_links set status = 'approved' where status is null;
alter table parent_student_links alter column status set default 'pending';
alter table parent_student_links alter column status set not null;
alter table parent_student_links add constraint parent_student_links_status_check
  check (status in ('pending', 'approved'));

-- The student approves or declines their own pending requests.
create policy links_approve on parent_student_links for update using (
  student_id = auth.uid()
) with check (
  student_id = auth.uid()
);
create policy links_decline on parent_student_links for delete using (
  student_id = auth.uid()
);

-- Every RLS policy that treats "a parent_student_links row exists" as
-- "this parent is linked" (added earlier this session to fix the
-- new-parent chicken-and-egg gaps) must now also require the link be
-- approved - otherwise a pending, unapproved request would immediately
-- grant the same visibility this migration exists to prevent.

drop policy if exists members_read on group_members;
create policy members_read on group_members for select using (
  is_group_member(group_id)
  or exists (
    select 1 from parent_student_links psl
    where psl.parent_id = auth.uid() and psl.student_id = group_members.student_id and psl.status = 'approved'
  )
);

drop policy if exists members_update on group_members;
create policy members_update on group_members for update using (
  student_id = auth.uid()
  or parent_id = auth.uid()
  or exists (
    select 1 from parent_student_links psl
    where psl.parent_id = auth.uid() and psl.student_id = group_members.student_id and psl.status = 'approved'
  )
) with check (
  parent_id = auth.uid() or parent_id is null or student_id = auth.uid()
);

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
      and psl.status = 'approved'
  )
);
