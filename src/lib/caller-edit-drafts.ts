/**
 * Merge server assignment drafts into local edit state without clobbering
 * in-progress (dirty) rows. Used by the admin template editor poll loop.
 */
export type CallerEditDraft = {
  march: string;
  offset: string;
  userId: string;
  name: string;
};

export function mergeCallerEditDrafts(
  prev: Record<string, CallerEditDraft>,
  serverDrafts: Record<string, CallerEditDraft>,
  dirtyIds: ReadonlySet<string>
): Record<string, CallerEditDraft> {
  const next: Record<string, CallerEditDraft> = {};
  for (const [id, serverDraft] of Object.entries(serverDrafts)) {
    if (dirtyIds.has(id) && prev[id]) {
      next[id] = prev[id];
    } else {
      next[id] = serverDraft;
    }
  }
  return next;
}
