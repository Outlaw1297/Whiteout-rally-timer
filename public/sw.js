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
  // Pass 1: heads-up friendly (no actions)
  try {
    const { actions: _a, ...noActions } = options;
    await self.registration.showNotification(title, noActions);
    return true;
  } catch {
    /* try with actions / full set */
  }

  try {
    await self.registration.showNotification(title, options);
    return true;
  } catch {
    /* try stripped */
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
      renotify: options.renotify !== false && !options.silent,
      silent: !!options.silent,
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
  const preferSilent = isCalibration || !!data.silent || isLivePing;
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
    silent: preferSilent,
    livePing: isLivePing,
    url,
  };

  /**
   * STABLE TAG + renotify: replace the previous alert for this caller instead of
   * stacking unique rows. Unique tags (with timestamps) caused Android/Samsung to
   * rate-limit heads-up — later alerts only appeared in the shade / quick panel.
   */
  const tag = preferSilent
    ? `calibration-${isLivePing ? "live" : "setup"}-${assignmentId || "device"}`
    : assignmentId
      ? `rally-caller-${assignmentId}`
      : `rally-event-${rallyId || "general"}`;

  event.waitUntil(
    (async () => {
      const clientList = await listWindowClients();
      const inForeground = hasFocusedClient(clientList);
      const hasOpenClient = clientList.length > 0;

      // Silent calibration / live pings must not interrupt the user.
      // When any app window is open, skip the OS banner and deliver via postMessage.
      // When backgrounded, Chrome still requires a user-visible notification for
      // push (userVisibleOnly) — show a silent placeholder, then close it ASAP.
      const skipBanner = preferSilent && hasOpenClient;

      const silentTitle = " ";
      const silentBody = " ";
      const notificationOptions = {
        body: preferSilent ? silentBody : body,
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        tag,
        renotify: !preferSilent,
        // Keep THROW sticky when possible; Android mostly ignores this, but it
        // does not hurt heads-up when Pop-up is enabled.
        requireInteraction: !preferSilent && isLaunch,
        silent: preferSilent,
        timestamp: receivedAtMs,
        // Short patterns — long multi-pulse vibrates are less reliable on One UI.
        vibrate: preferSilent ? [] : isLaunch ? [400, 120, 400] : [220, 100, 220],
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
          silent: preferSilent,
        },
      };

      // OS notification FIRST — this is what background users see.
      if (!skipBanner) {
        const shown = await showRallyNotification(
          preferSilent ? silentTitle : title,
          notificationOptions
        );
        if (!shown) {
          await self.registration.showNotification(
            preferSilent ? silentTitle : title || "Whiteout Rally",
            {
              body: preferSilent ? silentBody : body || "Rally notification",
              icon: "/icons/icon-192.png",
              tag,
              renotify: !preferSilent,
              silent: preferSilent,
              data: notificationOptions.data,
            }
          );
        }

        // Immediately dismiss silent calibration placeholders so they never linger
        // in the shade / make noise on OEMs that ignore the silent flag.
        if (preferSilent) {
          try {
            const notes = await self.registration.getNotifications({ tag });
            for (const note of notes) note.close();
          } catch {
            /* ignore */
          }
        }
      }

      // Then notify open pages (in-app banner when foreground).
      broadcastToClients(clientList, payload);

      // Delayed, caller-scoped cleanup only (stable tags already replace in place).
      if (!preferSilent && !skipBanner && assignmentId) {
        void clearPriorCallerNotifications(assignmentId, tag);
      }

      // Auto-dismiss only when the PWA is actually focused — never while gaming
      // in another app (Fold cover / multi-window visible-but-unfocused).
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
