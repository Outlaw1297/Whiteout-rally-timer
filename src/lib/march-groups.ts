export interface LaunchSlotGroup {
  launchTime: string | null;
  marchFormatted: string;
  marchDurationSeconds: number;
  assignmentIds: string[];
  displayNames: string[];
  status: string;
}

export interface MarchAssignment {
  id: string;
  displayName: string;
  marchDurationSeconds: number;
  marchFormatted: string;
  launchTime?: string | null;
  status?: string;
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
  return filtered.join(", ");
}

/** One UI row per launch slot; callers with the same launch time are merged. */
export function groupAssignmentsByLaunchSlot(assignments: MarchAssignment[]): LaunchSlotGroup[] {
  const bySlot = new Map<string, MarchAssignment[]>();

  for (const assignment of assignments) {
    const key = assignment.launchTime
      ? assignment.launchTime
      : `march-${assignment.marchDurationSeconds}`;
    const list = bySlot.get(key) ?? [];
    list.push(assignment);
    bySlot.set(key, list);
  }

  return Array.from(bySlot.values())
    .map((group) => {
      const sortedNames = group.map((a) => a.displayName);
      const statuses = group.map((a) => a.status ?? "WAITING");
      const aggregateStatus = statuses.every((s) => s === "LAUNCHED")
        ? "LAUNCHED"
        : statuses.some((s) => s === "WAITING")
          ? "WAITING"
          : statuses[0];

      return {
        launchTime: group[0].launchTime ?? null,
        marchFormatted: group[0].marchFormatted,
        marchDurationSeconds: group[0].marchDurationSeconds,
        assignmentIds: group.map((a) => a.id),
        displayNames: sortedNames,
        status: aggregateStatus,
      };
    })
    .sort((a, b) => {
      if (a.launchTime && b.launchTime) {
        return a.launchTime.localeCompare(b.launchTime);
      }
      if (a.launchTime) return -1;
      if (b.launchTime) return 1;
      return b.marchDurationSeconds - a.marchDurationSeconds;
    });
}
