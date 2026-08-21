import { Platform } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { apiFetch } from "./api";
import { getExpoProjectId } from "./config";
import { getOrCreateDeviceId } from "./device-id";

const PUSH_ENDPOINT_KEY = "rally_expo_push_endpoint";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function ensureAndroidChannel() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("rally-alerts", {
    name: "Rally alerts",
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 150, 250],
    lightColor: "#38BDF8",
    sound: "default",
    bypassDnd: false,
  });
}

export async function getStoredPushEndpoint(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(PUSH_ENDPOINT_KEY);
  } catch {
    return null;
  }
}

export async function registerForPushAsync(): Promise<{
  ok: boolean;
  endpoint?: string;
  error?: string;
}> {
  if (!Device.isDevice) {
    return { ok: false, error: "Push requires a physical device" };
  }

  await ensureAndroidChannel();

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== "granted") {
    return { ok: false, error: "Notification permission denied" };
  }

  const projectId = getExpoProjectId();
  if (!projectId) {
    return {
      ok: false,
      error:
        "Missing EAS projectId. On your Mac: cd mobile && npx eas-cli login && npx eas init — then restart Expo.",
    };
  }

  let token: string;
  try {
    const result = await Notifications.getExpoPushTokenAsync({ projectId });
    token = result.data;
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not get Expo push token",
    };
  }

  const deviceId = await getOrCreateDeviceId();
  const data = await apiFetch<{
    success: boolean;
    endpoint: string;
  }>("/api/push/native-subscribe", {
    method: "POST",
    body: JSON.stringify({
      expoPushToken: token,
      platform: Platform.OS === "ios" ? "iOS" : "Android",
      deviceId,
      userAgent: `expo-native/${Platform.OS}`,
    }),
  });

  await SecureStore.setItemAsync(PUSH_ENDPOINT_KEY, data.endpoint);
  return { ok: true, endpoint: data.endpoint };
}

export async function unregisterPush(endpoint?: string | null): Promise<void> {
  const target = endpoint || (await getStoredPushEndpoint());
  if (!target) return;
  await apiFetch("/api/push/unsubscribe", {
    method: "POST",
    body: JSON.stringify({ endpoint: target }),
  });
  await SecureStore.deleteItemAsync(PUSH_ENDPOINT_KEY);
}

export async function reportPushReceipt(payload: {
  dispatchId?: string;
  receiptToken?: string;
  stage?: "received" | "displayed" | "clicked" | "display_failed";
}): Promise<void> {
  if (!payload.dispatchId || !payload.receiptToken) return;
  try {
    await apiFetch("/api/push/receipt", {
      method: "POST",
      token: null,
      body: JSON.stringify({
        dispatchId: payload.dispatchId,
        receiptToken: payload.receiptToken,
        stage: payload.stage || "received",
        clientReceivedAtMs: Date.now(),
      }),
    });
  } catch {
    // Receipts are best-effort.
  }
}
