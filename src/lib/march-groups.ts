export interface LaunchSlotGroup {
  launchTime: string | null;
  marchFormatted: string;
  marchDurationSeconds: number;
  arrivalOffsetSeconds?: number;
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
  arrivalOffsetSeconds?: number;
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

export interface HitOrderWave {
  /** Seconds relative to the shared target (negative = earlier). */
  arrivalOffsetSeconds: number;
  assignmentIds: string[];
  displayNames: string[];
  marchLabels: string[];
}

export interface ThrowOrderWave {
  /** Seconds after GO until this wave throws (relative preview). */
  throwAfterGoSeconds: number;
  assignmentIds: string[];
  displayNames: string[];
  marchLabels: string[];
  arrivalOffsetSeconds: number;
}

/**
 * Preview hit (arrival) order before GO.
 * Shared target is T; each caller hits at T + offset. Lower offset hits first.
 */
export function getHitOrderPreview(assignments: MarchAssignment[]): HitOrderWave[] {
  const byOffset = new Map<number, MarchAssignment[]>();

  for (const assignment of assignments) {
    const offset = assignment.arrivalOffsetSeconds ?? 0;
    const list = byOffset.get(offset) ?? [];
    list.push(assignment);
    byOffset.set(offset, list);
  }

  return Array.from(byOffset.entries())
    .sort(([a], [b]) => a - b)
    .map(([offset, group]) => ({
      arrivalOffsetSeconds: offset,
      assignmentIds: group.map((a) => a.id),
      displayNames: group.map((a) => a.displayName),
      marchLabels: group.map((a) => a.marchFormatted),
    }));
}

/**
 * Preview throw (launch) order before GO.
 * First throw is at firstCallerLead after GO; later throws follow by (maxAdj - adj).
 */
export function getThrowOrderPreview(
  assignments: MarchAssignment[],
  firstCallerLeadSeconds = 3
): ThrowOrderWave[] {
  if (assignments.length === 0) return [];

  const adjusted = assignments.map((a) => {
    const offset = a.arrivalOffsetSeconds ?? 0;
    return {
      assignment: a,
      offset,
      adjustedMarch: a.marchDurationSeconds - offset,
    };
  });

  const maxAdjusted = Math.max(...adjusted.map((a) => a.adjustedMarch));

  const byThrow = new Map<number, typeof adjusted>();
  for (const row of adjusted) {
    const throwAfterGoSeconds = firstCallerLeadSeconds + (maxAdjusted - row.adjustedMarch);
    const list = byThrow.get(throwAfterGoSeconds) ?? [];
    list.push(row);
    byThrow.set(throwAfterGoSeconds, list);
  }

  return Array.from(byThrow.entries())
    .sort(([a], [b]) => a - b)
    .map(([throwAfterGoSeconds, group]) => ({
      throwAfterGoSeconds,
      assignmentIds: group.map((g) => g.assignment.id),
      displayNames: group.map((g) => g.assignment.displayName),
      marchLabels: group.map((g) => g.assignment.marchFormatted),
      arrivalOffsetSeconds: group[0].offset,
    }));
}

export function formatHitOffsetLabel(offsetSeconds: number): string {
  if (offsetSeconds === 0) return "at target (T)";
  if (offsetSeconds > 0) return `T+${offsetSeconds}s`;
  return `T${offsetSeconds}s`;
}

/** One UI row per launch slot; callers with the same launch time are merged. */
export function groupAssignmentsByLaunchSlot(assignments: MarchAssignment[]): LaunchSlotGroup[] {
  const bySlot = new Map<string, MarchAssignment[]>();

  for (const assignment of assignments) {
    const key = assignment.launchTime
      ? assignment.launchTime
      : `offset-${assignment.arrivalOffsetSeconds ?? 0}-march-${assignment.marchDurationSeconds}`;
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
        arrivalOffsetSeconds: group[0].arrivalOffsetSeconds ?? 0,
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
      const offsetDiff = (a.arrivalOffsetSeconds ?? 0) - (b.arrivalOffsetSeconds ?? 0);
      if (offsetDiff !== 0) return offsetDiff;
      return b.marchDurationSeconds - a.marchDurationSeconds;
    });
}
