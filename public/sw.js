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

function broadcastToClients(payload) {
  return self.clients
    .matchAll({ type: "window", includeUncontrolled: true })
    .then((clientList) => {
      for (const client of clientList) {
        client.postMessage(payload);
      }
      return clientList;
    });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Close older rally banners after the new one is shown (never block display). */
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

/**
 * If a warning arrives late on Pixel/Android, rewrite so we never flash
 * "10 seconds" after that window — escalate to THROW when imminent.
 */
function presentForLatency(data, receivedAtMs) {
  let title = data.title || "Whiteout Rally";
  let body = data.body || "Rally notification";
  let notificationType = data.notificationType || "";
  const launchMs = data.launchTime ? Date.parse(data.launchTime) : NaN;

  if (
    String(notificationType).startsWith("WARNING_") &&
    Number.isFinite(launchMs)
  ) {
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

self.addEventListener("push", (event) => {
  if (!event.data) return;

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

  const sticky = !preferSilent && isLaunch;

  const tag = isCalibration
    ? `calibration-${isLivePing ? "live" : "setup"}-${calibrationIndex}-${receivedAtMs}`
    : `rally-${rallyId}-${notificationType}-${assignmentId}-${receivedAtMs}`;

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
        : notificationType === "RALLY_STARTED"
          ? [180, 80, 180]
          : [400, 100, 400, 100, 400],
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

  event.waitUntil(
    (async () => {
      const clients = await broadcastToClients(payload);
      const hasOpenClient = clients.length > 0;
      const skipBanner = isLivePing && preferSilent && hasOpenClient;

      // SHOW FIRST — never block the banner on getNotifications()/clear (Pixel hang risk).
      const showPromise = skipBanner
        ? Promise.resolve()
        : self.registration.showNotification(
            preferSilent && isLivePing ? " " : title,
            notificationOptions
          );

      await showPromise;

      if (!preferSilent && !skipBanner) {
        void clearOtherRallyNotifications(assignmentId, rallyId, tag);
      }

      if (notificationType === "RALLY_STARTED" && !preferSilent) {
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

      if (isLivePing && preferSilent && !hasOpenClient) {
        const notes = await self.registration.getNotifications({ tag });
        for (const note of notes) note.close();
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
    })().catch(async () => {
      try {
        await self.registration.showNotification(title || "Whiteout Rally", {
          body: body || "Rally notification",
          icon: "/icons/icon-192.png",
          badge: "/icons/icon-192.png",
          requireInteraction: isLaunch,
          renotify: true,
          data: { url, notificationType, assignmentId, rallyId },
        });
      } catch {
        /* last resort failed */
      }
      try {
        await broadcastToClients(payload);
      } catch {
        /* ignore */
      }
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  if (event.action === "dismiss") return;

  const url = event.notification.data?.url || "/caller";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
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
