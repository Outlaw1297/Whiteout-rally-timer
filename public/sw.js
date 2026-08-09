self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

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

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: `rally-${rallyId}-${notificationType}-${assignmentId}`,
      renotify: true,
      requireInteraction: notificationType === "LAUNCH",
      vibrate: [200, 100, 200],
      data: {
        rallyId,
        assignmentId,
        notificationType,
        url: assignmentId
          ? `/caller/events/${rallyId}`
          : rallyId
            ? `/caller/events/${rallyId}`
            : "/caller",
      },
    })
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
