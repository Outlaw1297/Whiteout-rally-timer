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

async function listWindowClients() {
  return self.clients.matchAll({ type: "window", includeUncontrolled: true });
}

function broadcastToClients(clientList, payload) {
  for (const client of clientList) {
    client.postMessage(payload);
  }
}

/** True when some app window is focused/visible — otherwise treat as background. */
function hasForegroundClient(clientList) {
  return clientList.some(
    (c) => c.focused || (typeof c.visibilityState === "string" && c.visibilityState === "visible")
  );
}

async function clearOtherRallyNotifications(assignmentId, rallyId, keepTag) {
  try {
    const notes = await Promise.race([
      self.registration.getNotifications(),
      sleep(400).then(() => []),
    ]);
    for (const note of notes) {
      if (keepTag && note.tag === keepTag) continue;
      const data = note.data || {};
      const sameAssignment = assignmentId && data.assignmentId === assignmentId;
      const sameRally = rallyId && data.rallyId === rallyId;
      const isRallyAlert =
        data.notificationType &&
        data.notificationType !== "CALIBRATION" &&
        !String(note.tag || "").startsWith("calibration-");
      if (sameAssignment || (sameRally && isRallyAlert)) {
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
 */
async function showRallyNotification(title, options) {
  try {
    await self.registration.showNotification(title, options);
    return true;
  } catch {
    /* try stripped options */
  }

  try {
    const { actions: _a, vibrate: _v, timestamp: _t, ...rest } = options;
    await self.registration.showNotification(title, rest);
    return true;
  } catch {
    /* try minimal */
  }

  try {
    await self.registration.showNotification(title, {
      body: options.body || "Rally notification",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: options.tag,
      renotify: true,
      requireInteraction: !!options.requireInteraction,
      data: options.data,
    });
    return true;
  } catch {
    return false;
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
  const preferSilent = isCalibration || !!data.silent;
  const url = assignmentId
    ? `/caller/events/${rallyId}`
    : rallyId
      ? `/caller/events/${rallyId}`
      : "/caller";

  const isLaunch = notificationType === "LAUNCH";

  const payload = {
    type: "rally-push",
    title,
    body,
    rallyId,
    notificationType,
    assignmentId,
    scheduledAt,
    targetAt,
    calibrationIndex,
    calibrationTotal,
    url,
  };

  const tag = isCalibration
    ? `calibration-${isLivePing ? "live" : "setup"}-${calibrationIndex}-${receivedAtMs}`
    : `rally-${rallyId}-${notificationType}-${assignmentId}-${receivedAtMs}`;

  event.waitUntil(
    (async () => {
      const clientList = await listWindowClients();
      const inForeground = hasForegroundClient(clientList);

      // Only skip the OS banner for silent live pings while the app is actually open.
      const skipBanner = isLivePing && preferSilent && inForeground;

      // Background: keep banners sticky so Pixel doesn't bury them.
      const sticky = !preferSilent && (isLaunch || !inForeground);

      const notificationOptions = {
        body: preferSilent && isLivePing ? " " : body,
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        tag,
        renotify: true,
        requireInteraction: sticky,
        silent: preferSilent,
        timestamp: receivedAtMs,
        vibrate: preferSilent
          ? []
          : isLaunch
            ? [600, 120, 600, 120, 600, 120, 600]
            : [300, 100, 300],
        actions: preferSilent
          ? []
          : [
              { action: "open", title: "Open rally" },
              { action: "dismiss", title: "Dismiss" },
            ],
        data: {
          rallyId,
          assignmentId,
          notificationType,
          url,
        },
      };

      // OS notification FIRST — this is what background users see.
      if (!skipBanner) {
        const shown = await showRallyNotification(
          preferSilent && isLivePing ? " " : title,
          notificationOptions
        );
        if (!shown) {
          await self.registration.showNotification(title || "Whiteout Rally", {
            body: body || "Rally notification",
            icon: "/icons/icon-192.png",
          });
        }
      }

      // Then notify open pages (in-app banner when foreground).
      broadcastToClients(clientList, payload);

      if (!preferSilent && !skipBanner) {
        void clearOtherRallyNotifications(assignmentId, rallyId, tag);
      }

      // Only auto-dismiss while foreground — background users need time to see it.
      if (inForeground && notificationType === "RALLY_STARTED" && !preferSilent) {
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
        !preferSilent &&
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

      if (isLivePing && preferSilent && !inForeground) {
        try {
          const notes = await self.registration.getNotifications({ tag });
          for (const note of notes) note.close();
        } catch {
          /* ignore */
        }
      }

      if (targetAt) {
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
          }),
        }).catch(() => {});
      }
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  if (event.action === "dismiss") return;

  const url = event.notification.data?.url || "/caller";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          if (client.url.includes(url)) return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
    })
  );
});
