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
    url,
  };

  const notificationOptions = {
    body,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: `rally-${rallyId}-${notificationType}-${assignmentId}-${scheduledAt}`,
    renotify: true,
    requireInteraction: notificationType === "LAUNCH",
    vibrate: notificationType === "LAUNCH" ? [300, 100, 300, 100, 300] : [200, 100, 200],
    data: {
      rallyId,
      assignmentId,
      notificationType,
      url,
    },
  };

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, notificationOptions),
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
    ]).catch(() =>
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
