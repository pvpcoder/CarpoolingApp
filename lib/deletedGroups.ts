// In-memory store of deleted group IDs.
// Persists across screen navigations within the same app session.
// Resets on app restart (which is fine — Supabase soft-delete
// should have taken effect by then).

const deleted = new Set<string>();

export const deletedGroups = {
  add(groupId: string) {
    deleted.add(groupId);
  },

  isDeleted(groupId: string): boolean {
    return deleted.has(groupId);
  },

  getAll(): string[] {
    return Array.from(deleted);
  },
};
