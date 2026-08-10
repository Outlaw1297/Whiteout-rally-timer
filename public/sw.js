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

  const notificationOptions = {
    body: preferSilent && isLivePing ? " " : body,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: isCalibration
      ? `calibration-${isLivePing ? "live" : "setup"}-${calibrationIndex}-${receivedAtMs}`
      : `rally-${rallyId}-${notificationType}-${assignmentId}-${scheduledAt}`,
    renotify: !preferSilent,
    requireInteraction: !preferSilent && notificationType === "LAUNCH",
    silent: preferSilent,
    vibrate: preferSilent
      ? []
      : notificationType === "LAUNCH"
        ? [300, 100, 300, 100, 300]
        : [200, 100, 200],
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

      // Live silent pings: when the app is open, skip the OS banner entirely.
      // Setup calibration still shows a silent notification so iOS delivers it.
      const shouldShow =
        !(isLivePing && preferSilent && hasOpenClient) &&
        !(isLivePing && preferSilent === false);

      const showPromise =
        isLivePing && preferSilent && hasOpenClient
          ? Promise.resolve()
          : self.registration.showNotification(
              preferSilent && isLivePing ? " " : title,
              notificationOptions
            );

      // Close ephemeral silent live notifications quickly if shown (no open clients).
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

      void shouldShow;
      await Promise.all([showPromise, closePromise, feedbackPromise]);
    })().catch(() =>
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
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = event.notification.data?.url || "/caller";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes(url) && "focus" in client) {
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(url);
        }
      })
  );
});
