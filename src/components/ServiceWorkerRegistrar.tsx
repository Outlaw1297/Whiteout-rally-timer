"use client";

import { useEffect } from "react";

export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    // An installed PWA can remain suspended with an old Next.js bundle after a
    // deploy. When the updated worker takes control, reload once so the visible
    // app and its subscription-repair logic are from the same release.
    const hadControllerAtLoad = Boolean(navigator.serviceWorker.controller);
    let reloading = false;
    const handleControllerChange = () => {
      if (!hadControllerAtLoad || reloading) return;
      reloading = true;
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);

    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((registration) => {
        // Pick up SW fixes (Samsung heads-up tags, etc.) without waiting for navigate.
        void registration.update();

        if (registration.waiting) {
          registration.waiting.postMessage({ type: "SKIP_WAITING" });
        }

        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          if (!worker) return;
          worker.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) {
              worker.postMessage({ type: "SKIP_WAITING" });
            }
          });
        });

        return navigator.serviceWorker.ready;
      })
      .catch((err) => {
        console.warn("Service worker registration failed:", err);
      });

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
    };
  }, []);

  return null;
}
