type AssignmentCallState = {
  status: string;
  launchTime: Date | null;
};

/**
 * A caller has "called" once they've confirmed LAUNCHED, or their scheduled
 * throw time has passed (LAUNCH notification moment).
 */
export function callerHasCalled(
  assignment: AssignmentCallState,
  nowMs: number
): boolean {
  if (assignment.status === "LAUNCHED") return true;
  if (assignment.launchTime && assignment.launchTime.getTime() <= nowMs) {
    return true;
  }
  return false;
}

/** True when every assigned caller has called; false if nobody is assigned. */
export function allCallersHaveCalled(
  assignments: AssignmentCallState[],
  nowMs: number
): boolean {
  if (assignments.length === 0) return false;
  return assignments.every((a) => callerHasCalled(a, nowMs));
}
