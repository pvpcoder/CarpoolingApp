-- parents.student_id was a single nullable FK — one parent could only ever
-- link to one child. Real families carpool for 2+ kids. group_members
-- already supports this fine (no unique constraint blocking multiple rows
-- per parent), so the only real blocker was this single-column link.

create table if not exists parent_student_links (
  parent_id uuid not null references parents(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (parent_id, student_id)
);

alter table parent_student_links enable row level security;

create policy links_read on parent_student_links for select using (
  parent_id = auth.uid() or student_id = auth.uid()
);
create policy links_insert on parent_student_links for insert with check (
  parent_id = auth.uid()
);
create policy links_delete on parent_student_links for delete using (
  parent_id = auth.uid()
);

-- Backfill existing single links before dropping the old column.
insert into parent_student_links (parent_id, student_id)
select id, student_id from parents where student_id is not null
on conflict do nothing;

-- The group_members "claim this row" policy authorized a parent updating a
-- membership row (setting parent_id, before it was theirs) by joining
-- through parents.student_id — that column is being dropped, so the policy
-- must be dropped first (it depends on the column) and rebuilt to join
-- through parent_student_links instead.
drop policy if exists members_update on group_members;

alter table parents drop column if exists student_id;

create policy members_update on group_members for update using (
  student_id = auth.uid()
  or parent_id = auth.uid()
  or exists (
    select 1 from parent_student_links psl
    where psl.parent_id = auth.uid() and psl.student_id = group_members.student_id
  )
) with check (
  parent_id = auth.uid() or parent_id is null or student_id = auth.uid()
);
