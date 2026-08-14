import { calculateClockOffset } from "./time";

export interface MonotonicAnchor {
  serverMs: number;
  perfMs: number;
}

const SNAP_THRESHOLD_MS = 200;
const NUDGE_THRESHOLD_MS = 20;
const NUDGE_FACTOR = 0.5;

/** Drop NTP samples whose RTT looks like a main-thread hitch, not the network. */
export const MAX_INFLATED_RTT_OVER_MIN_MS = 80;
export const MAX_ABSOLUTE_RTT_MS = 400;

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

/**
 * A notification (or other hitch) can delay ping/pong handling by hundreds of ms.
 * That inflates RTT and would snap the on-screen countdown. Keep the monotonic
 * clock and wait for the next clean sample.
 */
export function shouldDiscardNtpSample(
  rtt: number,
  minRtt: number | null,
  hasPriorSync: boolean
): boolean {
  if (!hasPriorSync) return false;
  if (rtt > MAX_ABSOLUTE_RTT_MS) return true;
  if (minRtt != null && Number.isFinite(minRtt) && rtt > minRtt + MAX_INFLATED_RTT_OVER_MIN_MS) {
    return true;
  }
  return false;
}

/** Gently correct the anchor toward server time — avoids visible countdown jumps. */
export function applyServerTimeSync(
  anchor: MonotonicAnchor,
  estimatedServerNow: number,
  options: { allowSnap?: boolean } = {}
): MonotonicAnchor {
  const allowSnap = options.allowSnap !== false;
  const current = readMonotonicNow(anchor);
  const drift = estimatedServerNow - current;

  if (Math.abs(drift) > SNAP_THRESHOLD_MS) {
    if (!allowSnap) return anchor;
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
  private minRtt = Number.POSITIVE_INFINITY;
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

  private baselineRtt(): number | null {
    return Number.isFinite(this.minRtt) ? this.minRtt : null;
  }

  private noteGoodRtt(rtt: number) {
    if (rtt > 0 && rtt < this.minRtt) this.minRtt = rtt;
  }

  applyNtp(
    clientSendTime: number,
    serverReceiveTime: number,
    serverSendTime: number,
    clientReceiveTime: number
  ): boolean {
    const rtt = clientReceiveTime - clientSendTime;
    if (shouldDiscardNtpSample(rtt, this.baselineRtt(), this.lastSyncAt != null)) {
      return false;
    }
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
    this.noteGoodRtt(result.rtt);
    this.notify();
    return true;
  }

  applyUnixMs(unixMs: number, clientReceiveTime: number, clientSendTime: number): boolean {
    const rtt = Math.max(0, clientReceiveTime - clientSendTime);
    if (shouldDiscardNtpSample(rtt, this.baselineRtt(), this.lastSyncAt != null)) {
      return false;
    }
    const offset = unixMs - clientReceiveTime;
    // One-way keepalive (rtt 0) must never snap — queued time_sync after a
    // notification hitch would jump the countdown.
    this.anchor = applyServerTimeSync(this.anchor, clientReceiveTime + offset, {
      allowSnap: rtt > 0,
    });
    this.offset = offset;
    this.rtt = rtt;
    this.lastSyncAt = Date.now();
    this.noteGoodRtt(rtt);
    this.notify();
    return true;
  }
}

export const clockSync = new ClockSyncBus();
