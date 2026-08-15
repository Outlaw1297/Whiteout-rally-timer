self.__RALLY_SW_VERSION = "2026-08-15-pwa-refresh-2";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeError(error) {
  if (!error) return "Unknown notification error";
  const name = typeof error.name === "string" ? error.name : "Error";
  const message = typeof error.message === "string" ? error.message : String(error);
  return `${name}: ${message}`.slice(0, 900);
}

async function postPushReceipt(data, stage, detail = {}) {
  if (!data?.dispatchId || !data?.receiptToken) return;
  await fetch("/api/push/receipt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      dispatchId: data.dispatchId,
      receiptToken: data.receiptToken,
      stage,
      serviceWorkerVersion: self.__RALLY_SW_VERSION,
      ...detail,
    }),
  });
}

async function listWindowClients() {
  return self.clients.matchAll({ type: "window", includeUncontrolled: true });
}

function broadcastToClients(clientList, payload) {
  for (const client of clientList) {
    client.postMessage(payload);
  }
}

/**
 * Only treat a truly focused window as foreground.
 * Fold/multi-window "visible but unfocused" must still get a real OS alert
 * and must not auto-dismiss banners.
 */
function hasFocusedClient(clientList) {
  return clientList.some((c) => c.focused);
}

/**
 * Close older notifications for THIS caller only, after a delay so Samsung
 * One UI can finish showing the heads-up / brief pop-up first.
 * Never clear the whole rally — that was cancelling banners on Fold.
 */
async function clearPriorCallerNotifications(assignmentId, keepTag) {
  if (!assignmentId) return;
  try {
    await sleep(2800);
    const notes = await Promise.race([
      self.registration.getNotifications(),
      sleep(400).then(() => []),
    ]);
    for (const note of notes) {
      if (keepTag && note.tag === keepTag) continue;
      const data = note.data || {};
      if (data.assignmentId === assignmentId) {
        note.close();
      }
    }
  } catch {
    /* ignore */
  }
}

function presentForLatency(data, receivedAtMs) {
  let title = data.title || "Whiteout Rally";
  let body = data.body || "Rally notification";
  let notificationType = data.notificationType || "";
  const launchMs = data.launchTime ? Date.parse(data.launchTime) : NaN;

  if (String(notificationType).startsWith("WARNING_") && Number.isFinite(launchMs)) {
    const secondsLeft = (launchMs - receivedAtMs) / 1000;
    if (secondsLeft <= 3) {
      notificationType = "LAUNCH";
      title = "🚨 THROW RALLY NOW";
    } else {
      const match = /^WARNING_(\d+)$/.exec(notificationType);
      const ideal = match ? Number(match[1]) : 10;
      if (secondsLeft < ideal - 1.5) {
        const secs = Math.max(1, Math.ceil(secondsLeft));
        title = `${secs}s — throw soon`;
      }
    }
  }

  return { title, body, notificationType };
}

/**
 * Chrome on Android can reject richer notification options. Always try to show
 * something — background delivery depends on this succeeding (userVisibleOnly).
 * Prefer a simple options set first — Samsung heads-up is more reliable without
 * action buttons / exotic vibrate patterns.
 */
async function showRallyNotification(title, options) {
  const errors = [];
  // Pass 1: heads-up friendly (no actions)
  try {
    const { actions: _a, ...noActions } = options;
    await self.registration.showNotification(title, noActions);
    return { shown: true, attempt: "no-actions", errors };
  } catch (error) {
    errors.push(`no-actions: ${safeError(error)}`);
  }

  try {
    await self.registration.showNotification(title, options);
    return { shown: true, attempt: "full", errors };
  } catch (error) {
    errors.push(`full: ${safeError(error)}`);
  }

  try {
    const { actions: _a, vibrate: _v, timestamp: _t, ...rest } = options;
    await self.registration.showNotification(title, rest);
    return { shown: true, attempt: "stripped", errors };
  } catch (error) {
    errors.push(`stripped: ${safeError(error)}`);
  }

  try {
    await self.registration.showNotification(title, {
      body: options.body || "Rally notification",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: options.tag,
      renotify: options.renotify !== false && !options.silent,
      silent: !!options.silent,
      data: options.data,
    });
    return { shown: true, attempt: "minimal", errors };
  } catch (error) {
    errors.push(`minimal: ${safeError(error)}`);
    return { shown: false, attempt: "failed", errors };
  }
}

self.addEventListener("push", (event) => {
  // Chrome may drop background pushes if we don't show a notification quickly.
  if (!event.data) {
    event.waitUntil(
      self.registration.showNotification("Whiteout Rally", {
        body: "Rally update",
        icon: "/icons/icon-192.png",
      })
    );
    return;
  }

  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: "Whiteout Rally", body: event.data.text() };
  }

  const receivedAtMs = Date.now();
  const presented = presentForLatency(data, receivedAtMs);
  const title = presented.title;
  const body = presented.body;
  const notificationType = presented.notificationType;

  const rallyId = data.rallyId || "";
  const assignmentId = data.assignmentId || "";
  const scheduledAt = data.scheduledAt || "";
  const targetAt = data.targetAt || "";
  const calibrationIndex = data.calibrationIndex || 0;
  const calibrationTotal = data.calibrationTotal || 0;
  const isCalibration = notificationType === "CALIBRATION";
  const isLivePing = !!data.livePing || rallyId === "calibration-live";
  // Apple Web Push revokes subscriptions that process silent pushes. Legacy
  // calibration/live-ping payloads are deliberately upgraded to visible alerts.
  const preferSilent = false;
  if (!title.trim()) {
    presented.title = isCalibration ? "🔔 Rally notification timing check" : "Whiteout Rally";
  }
  if (!body.trim()) {
    presented.body = isCalibration ? "Notification delivery timing check." : "Rally update";
  }
  const url = assignmentId
    ? `/caller/events/${rallyId}`
    : rallyId
      ? `/caller/events/${rallyId}`
      : "/caller";

  const isLaunch = notificationType === "LAUNCH";

  const payload = {
    type: "rally-push",
    title: presented.title,
    body: presented.body,
    rallyId,
    notificationType,
    assignmentId,
    scheduledAt,
    targetAt,
    calibrationIndex,
    calibrationTotal,
    silent: preferSilent,
    livePing: isLivePing,
    dispatchId: data.dispatchId || "",
    subscriptionId: data.subscriptionId || "",
    url,
  };

  /**
   * STABLE TAG + renotify: replace the previous alert for this caller instead of
   * stacking unique rows. Unique tags (with timestamps) caused Android/Samsung to
   * rate-limit heads-up — later alerts only appeared in the shade / quick panel.
   */
  const tag = isCalibration
    ? `rally-calibration-${data.subscriptionId || "device"}`
    : assignmentId
      ? `rally-caller-${assignmentId}`
      : `rally-event-${rallyId || "general"}`;

  event.waitUntil(
    (async () => {
      const clientList = await listWindowClients();
      const inForeground = hasFocusedClient(clientList);
      const receiptTasks = [postPushReceipt(data, "received").catch(() => {})];
      const notificationOptions = {
        body: presented.body,
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        tag,
        renotify: true,
        // Keep THROW sticky when possible; Android mostly ignores this, but it
        // does not hurt heads-up when Pop-up is enabled.
        requireInteraction: isLaunch,
        silent: false,
        timestamp: receivedAtMs,
        // Short patterns — long multi-pulse vibrates are less reliable on One UI.
        vibrate: isLaunch ? [400, 120, 400] : [220, 100, 220],
        actions: [
          { action: "open", title: "Open rally" },
          { action: "dismiss", title: "Dismiss" },
        ],
        data: {
          rallyId,
          assignmentId,
          notificationType,
          url,
          silent: false,
          dispatchId: data.dispatchId || "",
          receiptToken: data.receiptToken || "",
        },
      };

      // Always create a user-visible effect. This is mandatory on Apple platforms.
      const display = await showRallyNotification(presented.title, notificationOptions);
      if (display.shown) {
        receiptTasks.push(
          postPushReceipt(data, "displayed", { attempt: display.attempt }).catch(() => {})
        );
      } else {
        receiptTasks.push(
          postPushReceipt(data, "display_failed", {
            error: display.errors.join(" | "),
          }).catch(() => {})
        );
      }

      // Then notify open pages (in-app banner when foreground).
      broadcastToClients(clientList, payload);

      // Delayed, caller-scoped cleanup only (stable tags already replace in place).
      if (assignmentId) {
        void clearPriorCallerNotifications(assignmentId, tag);
      }

      // Auto-dismiss only when the PWA is actually focused — never while gaming
      // in another app (Fold cover / multi-window visible-but-unfocused).
      if (inForeground && notificationType === "RALLY_STARTED") {
        setTimeout(() => {
          self.registration
            .getNotifications({ tag })
            .then((notes) => {
              for (const note of notes) note.close();
            })
            .catch(() => {});
        }, 5000);
      }

      if (
        inForeground &&
        !isLaunch &&
        String(notificationType).startsWith("WARNING_")
      ) {
        setTimeout(() => {
          self.registration
            .getNotifications({ tag })
            .then((notes) => {
              for (const note of notes) note.close();
            })
            .catch(() => {});
        }, 4000);
      }

      if (targetAt) {
        const currentSubscription = await self.registration.pushManager
          .getSubscription()
          .catch(() => null);
        await fetch("/api/push/delivery-feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            targetAt,
            receivedAtMs,
            assignmentId,
            notificationType,
            rallyId,
            endpoint: currentSubscription?.endpoint,
          }),
        }).catch(() => {});
      }

      await Promise.allSettled(receiptTasks);
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const notificationData = event.notification.data || {};
  if (event.action === "dismiss") return;

  const clickReceipt = postPushReceipt(
    {
      dispatchId: notificationData.dispatchId,
      receiptToken: notificationData.receiptToken,
    },
    "clicked"
  ).catch(() => {});

  const url = event.notification.data?.url || "/caller";

  event.waitUntil(
    Promise.all([
      clickReceipt,
      self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
        for (const client of clientList) {
          if ("focus" in client) {
            if (client.url.includes(url)) return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(url);
        }
      }),
    ])
  );
});
