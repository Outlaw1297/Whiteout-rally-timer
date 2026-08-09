export interface MarchAssignment {
  id: string;
  displayName: string;
  marchDurationSeconds: number;
  marchFormatted: string;
}

export interface MarchDuplicateGroup {
  marchDurationSeconds: number;
  marchFormatted: string;
  assignmentIds: string[];
  displayNames: string[];
}

/** Groups of callers that share the same march time (they launch together). */
export function getMarchDuplicateGroups(assignments: MarchAssignment[]): MarchDuplicateGroup[] {
  const byMarch = new Map<number, MarchAssignment[]>();

  for (const assignment of assignments) {
    const list = byMarch.get(assignment.marchDurationSeconds) ?? [];
    list.push(assignment);
    byMarch.set(assignment.marchDurationSeconds, list);
  }

  return Array.from(byMarch.values())
    .filter((group) => group.length > 1)
    .map((group) => ({
      marchDurationSeconds: group[0].marchDurationSeconds,
      marchFormatted: group[0].marchFormatted,
      assignmentIds: group.map((a) => a.id),
      displayNames: group.map((a) => a.displayName),
    }))
    .sort((a, b) => b.marchDurationSeconds - a.marchDurationSeconds);
}

export function getMarchDuplicateGroupForAssignment(
  assignmentId: string,
  groups: MarchDuplicateGroup[]
): MarchDuplicateGroup | null {
  return groups.find((group) => group.assignmentIds.includes(assignmentId)) ?? null;
}

export function formatJointLaunchNames(names: string[], exclude?: string): string {
  const filtered = exclude ? names.filter((n) => n !== exclude) : names;
  if (filtered.length === 0) return "";
  if (filtered.length === 1) return filtered[0];
  if (filtered.length === 2) return `${filtered[0]} & ${filtered[1]}`;
  return `${filtered.slice(0, -1).join(", ")} & ${filtered[filtered.length - 1]}`;
}
