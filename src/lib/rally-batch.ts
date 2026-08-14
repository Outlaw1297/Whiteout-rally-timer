import { prisma } from "@/lib/prisma";
import { startOrRestartRally } from "@/lib/start-rally";
import { serializeEvent } from "@/lib/rally-event";
import { resetEventToTemplate } from "@/lib/notifications";
import { broadcastRallyUpdate } from "@/server/rally-hub";
import { computeSharedTargetArrivalOnGo } from "@/lib/timing";

type BatchResult = {
  id: string;
  ok: boolean;
  error?: string;
  event?: unknown;
};

function emptyBatchError(message: string, results: BatchResult[] = []) {
  return {
    error: message,
    status: 400 as const,
    results,
    started: 0,
    reset: 0,
  };
}

export async function startManyRallies(
  eventIds: string[],
  options: { staggerSeconds?: number } = {}
): Promise<{
  status: number;
  started?: number;
  results?: BatchResult[];
  error?: string;
}> {
  const uniqueIds = Array.from(new Set(eventIds));
  if (uniqueIds.length === 0) {
    return emptyBatchError("Select at least one template");
  }
  if (uniqueIds.length > 10) {
    return emptyBatchError("Start at most 10 rallies at once");
  }

  const staggerSeconds = Math.max(0, Math.min(options.staggerSeconds ?? 0, 600));
  const baseStartedAt = new Date();

  const loaded = await prisma.rallyEvent.findMany({
    where: { id: { in: uniqueIds } },
    include: { assignments: true },
  });
  const startable = loaded.filter(
    (event) => event.status !== "CANCELLED" && event.assignments.length > 0
  );
  const sharedTarget = computeSharedTargetArrivalOnGo(
    baseStartedAt,
    startable.map((event) => ({
      gatherDurationSeconds: event.gatherDurationSeconds,
      firstCallerLeadSeconds: event.firstCallerLeadSeconds,
      marches: event.assignments.map((a) => a.marchDurationSeconds),
      offsets: event.assignments.map((a) => a.arrivalOffsetSeconds ?? 0),
    }))
  );

  const results: BatchResult[] = [];

  for (let i = 0; i < uniqueIds.length; i++) {
    const id = uniqueIds[i];
    const startedAt = new Date(baseStartedAt.getTime() + i * staggerSeconds * 1000);
    const targetArrivalTime = new Date(sharedTarget.getTime() + i * staggerSeconds * 1000);
    const result = await startOrRestartRally(id, { startedAt, targetArrivalTime });
    if ("error" in result && result.error) {
      results.push({ id, ok: false, error: result.error });
    } else if ("event" in result) {
      results.push({ id, ok: true, event: result.event });
    } else {
      results.push({ id, ok: false, error: "Unknown start failure" });
    }
  }

  const started = results.filter((r) => r.ok).length;
  if (started === 0) {
    return {
      error: results[0]?.error || "Could not start selected rallies",
      status: 400,
      results,
      started: 0,
    };
  }

  return { started, results, status: 200 };
}

export async function resetRally(eventId: string): Promise<{
  status: number;
  error?: string;
  event?: unknown;
}> {
  const event = await prisma.rallyEvent.findUnique({ where: { id: eventId } });
  if (!event) return { error: "Event not found", status: 404 };
  if (event.status === "CANCELLED") {
    return { error: "Cannot reset a cancelled rally", status: 400 };
  }
  if (event.status === "DRAFT" || event.status === "READY") {
    return { error: "Template is not running — edit it directly", status: 400 };
  }

  await resetEventToTemplate(eventId);

  const updated = await prisma.rallyEvent.findUnique({
    where: { id: eventId },
    include: {
      assignments: {
        include: { user: true },
        orderBy: { marchDurationSeconds: "desc" },
      },
    },
  });

  const payload = serializeEvent(updated!);
  broadcastRallyUpdate(eventId, payload);
  return { event: payload, status: 200 };
}

export async function resetManyRallies(eventIds: string[]): Promise<{
  status: number;
  reset?: number;
  results?: BatchResult[];
  error?: string;
}> {
  const uniqueIds = Array.from(new Set(eventIds));
  if (uniqueIds.length === 0) {
    return emptyBatchError("Select at least one rally");
  }
  if (uniqueIds.length > 10) {
    return emptyBatchError("Reset at most 10 rallies at once");
  }

  const results: BatchResult[] = [];
  for (const id of uniqueIds) {
    const result = await resetRally(id);
    if (result.error) {
      results.push({ id, ok: false, error: result.error });
    } else {
      results.push({ id, ok: true, event: result.event });
    }
  }

  const reset = results.filter((r) => r.ok).length;
  if (reset === 0) {
    return {
      error: results[0]?.error || "Could not reset selected rallies",
      status: results[0]?.error?.includes("not found") ? 404 : 400,
      results,
      reset: 0,
    };
  }

  return { reset, results, status: 200 };
}

export async function cloneRallyTemplate(eventId: string, name?: string) {
  const source = await prisma.rallyEvent.findUnique({
    where: { id: eventId },
    include: { assignments: true },
  });

  if (!source) return { error: "Event not found" as const, status: 404 as const };
  if (source.status === "CANCELLED") {
    return { error: "Cannot clone a cancelled event" as const, status: 400 as const };
  }

  const cloned = await prisma.rallyEvent.create({
    data: {
      name: name?.trim() || `${source.name} (copy)`,
      gatherDurationSeconds: source.gatherDurationSeconds,
      firstCallerLeadSeconds: source.firstCallerLeadSeconds,
      pushLeadMs: source.pushLeadMs,
      isTestMode: source.isTestMode,
      pinned: false,
      sortOrder: source.sortOrder,
      status: source.assignments.length > 0 ? "READY" : "DRAFT",
      assignments: {
        create: source.assignments.map((a) => ({
          callerName: a.callerName,
          userId: a.userId,
          marchDurationSeconds: a.marchDurationSeconds,
          arrivalOffsetSeconds: a.arrivalOffsetSeconds ?? 0,
        })),
      },
    },
    include: {
      assignments: { include: { user: true }, orderBy: { marchDurationSeconds: "desc" } },
    },
  });

  return { event: cloned, status: 201 as const };
}
