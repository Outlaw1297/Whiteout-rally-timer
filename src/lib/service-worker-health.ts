"use client";

export interface ServiceWorkerHealth {
  supported: boolean;
  controlled: boolean;
  registrationState: ServiceWorkerState | "missing" | "unknown";
  version: string | null;
  responding: boolean;
  scriptPath: string | null;
}

const VERSION_TIMEOUT_MS = 1_500;

function scriptPath(worker: ServiceWorker | null | undefined): string | null {
  if (!worker?.scriptURL) return null;
  try {
    const url = new URL(worker.scriptURL);
    return `${url.pathname}${url.search}`;
  } catch {
    return worker.scriptURL.slice(0, 255);
  }
}

async function askWorkerVersion(worker: ServiceWorker): Promise<string | null> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timeout = window.setTimeout(() => resolve(null), VERSION_TIMEOUT_MS);
    channel.port1.onmessage = (event) => {
      window.clearTimeout(timeout);
      const version = event.data?.version;
      resolve(typeof version === "string" ? version.slice(0, 100) : null);
    };

    try {
      worker.postMessage({ type: "GET_RALLY_SW_VERSION" }, [channel.port2]);
    } catch {
      window.clearTimeout(timeout);
      resolve(null);
    }
  });
}

/**
 * Inspect the worker that controls the open PWA. This is intentionally a
 * foreground check: it proves installation/control, but it does not claim that
 * iOS will wake the same worker for a future background push.
 */
export async function inspectServiceWorkerHealth(): Promise<ServiceWorkerHealth> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return {
      supported: false,
      controlled: false,
      registrationState: "missing",
      version: null,
      responding: false,
      scriptPath: null,
    };
  }

  try {
    const registration = await navigator.serviceWorker.getRegistration("/");
    const controller = navigator.serviceWorker.controller;
    const worker = controller || registration?.active || registration?.waiting || registration?.installing;
    const version = worker ? await askWorkerVersion(worker) : null;

    return {
      supported: true,
      controlled: Boolean(controller),
      registrationState: worker?.state || (registration ? "unknown" : "missing"),
      version,
      responding: version !== null,
      scriptPath: scriptPath(worker),
    };
  } catch {
    return {
      supported: true,
      controlled: Boolean(navigator.serviceWorker.controller),
      registrationState: "unknown",
      version: null,
      responding: false,
      scriptPath: scriptPath(navigator.serviceWorker.controller),
    };
  }
}
