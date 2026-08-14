/**
 * Merge server assignment drafts into local edit state without clobbering
 * in-progress (dirty) fields. Used by the admin template editor poll loop.
 */
export type CallerEditDraft = {
  march: string;
  offset: string;
  userId: string;
  name: string;
};

export type CallerEditField = keyof CallerEditDraft;

export type CallerDirtyFields = Readonly<
  Record<string, ReadonlySet<CallerEditField> | undefined>
>;

const CALLER_EDIT_FIELDS: CallerEditField[] = ["march", "offset", "userId", "name"];

export function mergeCallerEditDrafts(
  prev: Record<string, CallerEditDraft>,
  serverDrafts: Record<string, CallerEditDraft>,
  dirtyFields: CallerDirtyFields
): Record<string, CallerEditDraft> {
  const next: Record<string, CallerEditDraft> = {};
  for (const [id, serverDraft] of Object.entries(serverDrafts)) {
    const local = prev[id];
    const dirty = dirtyFields[id];
    if (local && dirty && dirty.size > 0) {
      const merged = { ...serverDraft };
      for (const field of CALLER_EDIT_FIELDS) {
        if (dirty.has(field)) merged[field] = local[field];
      }
      next[id] = merged;
    } else {
      next[id] = serverDraft;
    }
  }
  return next;
}
