import { calculateClockOffset } from "./time";

export interface MonotonicAnchor {
  serverMs: number;
  perfMs: number;
}

const SNAP_THRESHOLD_MS = 200;
const NUDGE_THRESHOLD_MS = 20;
const NUDGE_FACTOR = 0.5;
export const MAX_INFLATED_RTT_OVER_MIN_MS = 80;
export const MAX_ABSOLUTE_RTT_MS = 400;

function perfNow(): number {
  return Date.now();
}

export function createMonotonicAnchor(serverMs: number = Date.now()): MonotonicAnchor {
  return { serverMs, perfMs: perfNow() };
}

export function readMonotonicNow(anchor: MonotonicAnchor): number {
  return Math.round(anchor.serverMs + (perfNow() - anchor.perfMs));
}

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

type ClockListener = () => void;

class ClockSyncBus {
  private anchor = createMonotonicAnchor();
  private listeners = new Set<ClockListener>();
  private offset = 0;
  private rtt = 0;
  private minRtt = Number.POSITIVE_INFINITY;
  private lastSyncAt: number | null = null;

  correctedNow = (): number => readMonotonicNow(this.anchor);

  getLastSyncAt = () => this.lastSyncAt;

  subscribe(listener: ClockListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
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
    const offset = calculateClockOffset(
      clientSendTime,
      serverReceiveTime,
      serverSendTime,
      clientReceiveTime
    );
    this.anchor = applyServerTimeSync(this.anchor, clientReceiveTime + offset);
    this.offset = offset;
    this.rtt = rtt;
    this.lastSyncAt = Date.now();
    this.noteGoodRtt(rtt);
    this.notify();
    return true;
  }

  applyUnixMs(unixMs: number, clientReceiveTime: number, clientSendTime: number): boolean {
    const rtt = Math.max(0, clientReceiveTime - clientSendTime);
    if (shouldDiscardNtpSample(rtt, this.baselineRtt(), this.lastSyncAt != null)) {
      return false;
    }
    const offset = unixMs - clientReceiveTime;
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
