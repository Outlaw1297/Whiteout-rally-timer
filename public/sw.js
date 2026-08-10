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

/**
 * Pixel/Android often suppresses heads-up for follow-up alerts while an earlier
 * sticky notification (e.g. RALLY_STARTED with requireInteraction) is still up.
 * Clear prior alerts for this assignment so WARNING/LAUNCH can pop on screen.
 */
async function clearPriorRallyNotifications(assignmentId, rallyId, keepTag) {
  try {
    const notes = await self.registration.getNotifications();
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

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: "Whiteout Rally", body: event.data.text() };
  }

  const title = data.title || "Whiteout Rally";
  const body = data.body || "Rally notification";
  const rallyId = data.rallyId || "";
  const notificationType = data.notificationType || "";
  const assignmentId = data.assignmentId || "";
  const scheduledAt = data.scheduledAt || "";
  const targetAt = data.targetAt || "";
  const calibrationIndex = data.calibrationIndex || 0;
  const calibrationTotal = data.calibrationTotal || 0;
  const isCalibration = notificationType === "CALIBRATION";
  const isLivePing = !!data.livePing || rallyId === "calibration-live";
  const preferSilent = isCalibration || !!data.silent;
  const receivedAtMs = Date.now();
  const url = assignmentId
    ? `/caller/events/${rallyId}`
    : rallyId
      ? `/caller/events/${rallyId}`
      : "/caller";

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

  // Only THROW stays sticky. RALLY_STARTED used to stay on screen and blocked
  // Pixel from heads-up-ing later WARNING / LAUNCH alerts.
  const sticky =
    !preferSilent &&
    (notificationType === "LAUNCH" ||
      notificationType === "WARNING_5" ||
      notificationType === "WARNING_3");

  const tag = isCalibration
    ? `calibration-${isLivePing ? "live" : "setup"}-${calibrationIndex}-${receivedAtMs}`
    : `rally-${rallyId}-${notificationType}-${assignmentId}-${scheduledAt}-${receivedAtMs}`;

  const notificationOptions = {
    body: preferSilent && isLivePing ? " " : body,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag,
    renotify: !preferSilent,
    requireInteraction: sticky,
    silent: preferSilent,
    timestamp: receivedAtMs,
    vibrate: preferSilent
      ? []
      : notificationType === "LAUNCH"
        ? [500, 150, 500, 150, 500, 150, 500]
        : notificationType === "RALLY_STARTED"
          ? [200, 100, 200]
          : [350, 120, 350, 120, 350],
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

      if (!preferSilent && !skipBanner) {
        await clearPriorRallyNotifications(assignmentId, rallyId, tag);
      }

      const showPromise = skipBanner
        ? Promise.resolve()
        : self.registration.showNotification(
            preferSilent && isLivePing ? " " : title,
            notificationOptions
          );

      // Don't await — keeping the push handler open for 8s risks SW timeout.
      // Auto-dismiss RALLY_STARTED so it does not suppress later heads-ups on Pixel.
      if (notificationType === "RALLY_STARTED" && !preferSilent) {
        void showPromise.then(() => {
          setTimeout(() => {
            self.registration
              .getNotifications({ tag })
              .then((notes) => {
                for (const note of notes) note.close();
              })
              .catch(() => {});
          }, 8000);
        });
      }

      const closePromise =
        isLivePing && preferSilent
          ? showPromise.then(async () => {
              if (hasOpenClient) return;
              const notes = await self.registration.getNotifications({
                tag: notificationOptions.tag,
              });
              for (const note of notes) note.close();
            })
          : Promise.resolve();

      const feedbackPromise = targetAt
        ? fetch("/api/push/delivery-feedback", {
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
          }).catch(() => {})
        : Promise.resolve();

      await Promise.all([showPromise, closePromise, feedbackPromise]);
    })().catch(() =>
      self.registration
        .showNotification(title, {
          body,
          icon: "/icons/icon-192.png",
          badge: "/icons/icon-192.png",
          requireInteraction: notificationType === "LAUNCH",
          renotify: true,
          timestamp: Date.now(),
          data: { url, notificationType, assignmentId, rallyId },
        })
        .catch(() => {})
        .then(() =>
          Promise.all([
            broadcastToClients(payload),
            targetAt
              ? fetch("/api/push/delivery-feedback", {
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
                }).catch(() => {})
              : Promise.resolve(),
          ])
        )
    )
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
