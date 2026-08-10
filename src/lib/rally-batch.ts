import { prisma } from "@/lib/prisma";
import { startOrRestartRally } from "@/lib/start-rally";

export async function startManyRallies(
  eventIds: string[],
  options: { staggerSeconds?: number } = {}
): Promise<{
  status: number;
  started?: number;
  results?: Array<{ id: string; ok: boolean; error?: string; event?: unknown }>;
  error?: string;
}> {
  const uniqueIds = Array.from(new Set(eventIds));
  if (uniqueIds.length === 0) {
    return { error: "Select at least one template", status: 400 };
  }
  if (uniqueIds.length > 10) {
    return { error: "Start at most 10 rallies at once", status: 400 };
  }

  const staggerSeconds = Math.max(0, Math.min(options.staggerSeconds ?? 0, 600));
  const baseStartedAt = new Date();
  const results: Array<{
    id: string;
    ok: boolean;
    error?: string;
    event?: unknown;
  }> = [];

  for (let i = 0; i < uniqueIds.length; i++) {
    const id = uniqueIds[i];
    const startedAt = new Date(baseStartedAt.getTime() + i * staggerSeconds * 1000);
    const result = await startOrRestartRally(id, { startedAt });
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
