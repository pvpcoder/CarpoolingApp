-- groups_read (20260830011000) added a raw EXISTS subquery directly on
-- group_members instead of going through a SECURITY DEFINER helper like
-- every other cross-table check in this schema (is_group_member,
-- is_group_admin, shares_group_with). That broke members_insert, which
-- has always queried carpool_groups directly in its WITH CHECK: inserting
-- into group_members -> evaluates carpool_groups' RLS (groups_read) ->
-- which now re-queries group_members -> Postgres's RLS recursion guard
-- trips ("infinite recursion detected in policy for relation
-- group_members"), since accepting an invite is exactly this INSERT path.
--
-- Fix: move the check into a SECURITY DEFINER function (runs as the table
-- owner, bypassing RLS on group_members entirely), matching the existing
-- pattern instead of re-triggering it.

create or replace function is_linked_parent_of_group(gid uuid) returns boolean
    language sql stable security definer
    set search_path to 'public', 'pg_temp'
    as $$
  select exists (
    select 1 from group_members gm
    join parent_student_links psl on psl.student_id = gm.student_id
    where gm.group_id = gid
      and gm.status = 'active'
      and psl.parent_id = auth.uid()
      and psl.status = 'approved'
  );
$$;

grant execute on function is_linked_parent_of_group(uuid) to authenticated;

drop policy if exists groups_read on carpool_groups;
create policy groups_read on carpool_groups for select using (
  is_group_member(id)
  or created_by = auth.uid()
  or exists (
    select 1 from group_invites gi
    where gi.group_id = carpool_groups.id and gi.invited_student_id = auth.uid()
  )
  or is_linked_parent_of_group(id)
);
