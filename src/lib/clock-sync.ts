import { calculateClockOffset } from "./time";

export interface MonotonicAnchor {
  serverMs: number;
  perfMs: number;
}

const SNAP_THRESHOLD_MS = 200;
const NUDGE_THRESHOLD_MS = 20;
const NUDGE_FACTOR = 0.5;

function perfNow(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

export function createMonotonicAnchor(serverMs: number = Date.now()): MonotonicAnchor {
  return { serverMs, perfMs: perfNow() };
}

export function readMonotonicNow(anchor: MonotonicAnchor): number {
  return Math.round(anchor.serverMs + (perfNow() - anchor.perfMs));
}

/** Gently correct the anchor toward server time — avoids visible countdown jumps. */
export function applyServerTimeSync(
  anchor: MonotonicAnchor,
  estimatedServerNow: number
): MonotonicAnchor {
  const current = readMonotonicNow(anchor);
  const drift = estimatedServerNow - current;

  if (Math.abs(drift) > SNAP_THRESHOLD_MS) {
    return createMonotonicAnchor(estimatedServerNow);
  }
  if (Math.abs(drift) > NUDGE_THRESHOLD_MS) {
    const adjusted = current + drift * NUDGE_FACTOR;
    return createMonotonicAnchor(adjusted);
  }
  return anchor;
}

export function applyNtpSample(
  anchor: MonotonicAnchor,
  clientSendTime: number,
  serverReceiveTime: number,
  serverSendTime: number,
  clientReceiveTime: number
): { anchor: MonotonicAnchor; offset: number; rtt: number } {
  const offset = calculateClockOffset(
    clientSendTime,
    serverReceiveTime,
    serverSendTime,
    clientReceiveTime
  );
  const estimatedServerNow = clientReceiveTime + offset;
  return {
    anchor: applyServerTimeSync(anchor, estimatedServerNow),
    offset,
    rtt: clientReceiveTime - clientSendTime,
  };
}

type ClockListener = () => void;

/** Module-level clock bus so multiple hooks can share one sync source. */
class ClockSyncBus {
  private anchor = createMonotonicAnchor();
  private listeners = new Set<ClockListener>();
  private offset = 0;
  private rtt = 0;
  private lastSyncAt: number | null = null;

  correctedNow = (): number => readMonotonicNow(this.anchor);

  getOffset = () => this.offset;
  getRtt = () => this.rtt;
  getLastSyncAt = () => this.lastSyncAt;

  subscribe(listener: ClockListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach((listener) => listener());
  }

  applyNtp(
    clientSendTime: number,
    serverReceiveTime: number,
    serverSendTime: number,
    clientReceiveTime: number
  ) {
    const result = applyNtpSample(
      this.anchor,
      clientSendTime,
      serverReceiveTime,
      serverSendTime,
      clientReceiveTime
    );
    this.anchor = result.anchor;
    this.offset = result.offset;
    this.rtt = result.rtt;
    this.lastSyncAt = Date.now();
    this.notify();
  }

  applyUnixMs(unixMs: number, clientReceiveTime: number, clientSendTime: number) {
    const offset = unixMs - clientReceiveTime;
    this.anchor = applyServerTimeSync(this.anchor, clientReceiveTime + offset);
    this.offset = offset;
    this.rtt = clientReceiveTime - clientSendTime;
    this.lastSyncAt = Date.now();
    this.notify();
  }
}

export const clockSync = new ClockSyncBus();
