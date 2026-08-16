import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

type Listener = (event: Record<string, unknown>) => void;

const listeners = new Map<string, Listener>();
const displayed: Array<{ title: string; options: Record<string, unknown> }> = [];
const receipts: Array<Record<string, unknown>> = [];

const workerScope = {
  location: {
    origin: "https://rally.example",
  },
  addEventListener(type: string, listener: Listener) {
    listeners.set(type, listener);
  },
  skipWaiting: async () => undefined,
  clients: {
    claim: async () => undefined,
    matchAll: async () => [],
    openWindow: async () => undefined,
  },
  registration: {
    showNotification: async (title: string, options: Record<string, unknown>) => {
      assert.equal(typeof options.navigate, "string", "replacement has a default action");
      assert.ok(options.navigate, "replacement default action is not empty");
      assert.doesNotThrow(
        () => new URL(String(options.navigate), "https://rally.example"),
        "replacement notification has a valid default-action URL"
      );
      displayed.push({ title, options });
    },
    getNotifications: async () => [],
    pushManager: {
      getSubscription: async () => null,
    },
  },
};

const fetchMock = async (input: string, init?: { body?: string }) => {
  if (input === "/api/push/receipt" && init?.body) {
    receipts.push(JSON.parse(init.body) as Record<string, unknown>);
  }
  return { ok: true };
};

async function main() {
  const source = await readFile("public/sw.js", "utf8");
  vm.runInNewContext(source, {
    self: workerScope,
    fetch: fetchMock,
    URL,
    setTimeout,
    clearTimeout,
    console,
  });

  const pushListener = listeners.get("push");
  assert.ok(pushListener, "service worker registered a push listener");

  let lifetime: Promise<unknown> | undefined;
  pushListener({
    data: null,
    notification: {
      title: "Apple proposed notification",
      body: "Declarative push body",
      navigate: "/caller/test",
      data: {
        dispatchId: "dispatch-apple-proposed",
        receiptToken: "signed-receipt-token",
        subscriptionId: "subscription-1",
        notificationType: "TEST",
      },
    },
    waitUntil(promise: Promise<unknown>) {
      lifetime = promise;
    },
  });

  assert.ok(lifetime, "push handler extended the event lifetime");
  await lifetime;

  assert.equal(displayed.length, 1, "proposed notification was displayed by the worker");
  assert.equal(displayed[0].title, "Apple proposed notification");
  assert.equal(displayed[0].options.body, "Declarative push body");
  assert.equal(
    displayed[0].options.navigate,
    "https://rally.example/caller/test",
    "declarative navigate target became the replacement default action"
  );
  assert.equal(
    (displayed[0].options.data as Record<string, unknown>).url,
    "https://rally.example/caller/test",
    "declarative navigate target was preserved"
  );

  assert.deepEqual(
    receipts.map((receipt) => receipt.stage).sort(),
    ["displayed", "received"],
    "worker sent both delivery receipts"
  );
  for (const receipt of receipts) {
    assert.equal(receipt.dispatchId, "dispatch-apple-proposed");
    assert.equal(receipt.receiptToken, "signed-receipt-token");
    assert.equal(receipt.serviceWorkerVersion, "2026-08-16-origin-guard-1");
  }

  const clickListener = listeners.get("notificationclick");
  assert.ok(clickListener, "service worker registered a notification click listener");

  let clickLifetime: Promise<unknown> | undefined;
  let defaultActionPrevented = false;
  clickListener({
    action: "",
    notification: {
      data: displayed[0].options.data,
      close() {},
    },
    preventDefault() {
      defaultActionPrevented = true;
    },
    waitUntil(promise: Promise<unknown>) {
      clickLifetime = promise;
    },
  });

  assert.equal(defaultActionPrevented, true, "worker took over WebKit's default action");
  assert.ok(clickLifetime, "click handler extended the event lifetime");
  await clickLifetime;
  assert.equal(
    receipts.filter((receipt) => receipt.stage === "clicked").length,
    1,
    "click was receipted before navigation"
  );

  let unsafeLifetime: Promise<unknown> | undefined;
  pushListener({
    data: null,
    notification: {
      title: "Unsafe internal Render URL",
      body: "Must stay on the installed PWA origin",
      navigate: "https://localhost:10000/caller",
      data: {
        dispatchId: "dispatch-localhost",
        receiptToken: "signed-localhost-token",
        notificationType: "TEST",
        navigate: "https://localhost:10000/caller",
      },
    },
    waitUntil(promise: Promise<unknown>) {
      unsafeLifetime = promise;
    },
  });
  assert.ok(unsafeLifetime, "unsafe-origin push extended the event lifetime");
  await unsafeLifetime;
  assert.equal(displayed.length, 2, "unsafe-origin notification was still displayed");
  assert.equal(
    displayed[1].options.navigate,
    "https://rally.example/caller",
    "localhost default action was replaced with the installed PWA origin"
  );
  assert.equal(
    (displayed[1].options.data as Record<string, unknown>).url,
    "https://rally.example/caller",
    "localhost click data was replaced with the installed PWA origin"
  );

  console.log("PASS Apple proposed notification is displayed, receipted, and click-tracked");
}

void main();
