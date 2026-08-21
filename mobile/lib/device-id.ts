import AsyncStorage from "@react-native-async-storage/async-storage";

const DEVICE_ID_KEY = "rally_device_id";

function uuidV4(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Stable per-install id used for push device dedupe. */
export async function getOrCreateDeviceId(): Promise<string> {
  const existing = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (existing && /^[0-9a-f-]{36}$/i.test(existing)) {
    return existing.toLowerCase();
  }
  const id = uuidV4().toLowerCase();
  await AsyncStorage.setItem(DEVICE_ID_KEY, id);
  return id;
}
