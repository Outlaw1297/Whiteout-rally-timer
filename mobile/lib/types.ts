export interface SessionUser {
  id: string;
  username: string;
  displayName: string;
  role: "ADMIN" | "CALLER" | "DEVELOPER";
}

export interface SerializedAssignment {
  id: string;
  userId: string | null;
  displayName: string;
  marchDurationSeconds: number;
  marchFormatted: string;
  arrivalOffsetSeconds?: number;
  launchTime: string | null;
  expectedArrivalTime: string | null;
  status: string;
  launchedConfirmedAt: string | null;
  hasPushAccount?: boolean;
}

export interface SerializedEvent {
  id: string;
  name: string;
  targetArrivalTime: string | null;
  gatherDurationSeconds: number;
  firstCallerLeadSeconds?: number;
  pushLeadMs?: number;
  status: string;
  isTestMode: boolean;
  isTemplate?: boolean;
  pinned?: boolean;
  sortOrder?: number;
  assignments: SerializedAssignment[];
  nextCaller: { displayName: string; launchTime: string; assignmentId: string } | null;
  serverTime: { serverTime: string; unixMs: number };
}

export interface NotificationPreferences {
  warningLeadsSeconds: number[];
  allowedWarningLeads: number[];
  required: string[];
  launchEnabled: boolean;
  rallyStartedEnabled: boolean;
}
