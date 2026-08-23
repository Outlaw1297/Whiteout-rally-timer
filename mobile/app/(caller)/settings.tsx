import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Redirect } from "expo-router";
import * as Notifications from "expo-notifications";
import { useAuth } from "../../lib/auth";
import { apiFetch, ApiError } from "../../lib/api";
import {
  getStoredPushEndpoint,
  registerForPushAsync,
  reportPushReceipt,
  unregisterPush,
} from "../../lib/push";
import { getApiBaseUrl, getExpoProjectId } from "../../lib/config";
import type { NotificationPreferences } from "../../lib/types";
import { colors } from "../../components/theme";
import { useBottomInset } from "../../components/Screen";

const ALLOWED = [60, 30, 15, 10, 5, 3];

export default function SettingsScreen() {
  const { user, loading } = useAuth();
  const bottomInset = useBottomInset();
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [pushEndpoint, setPushEndpoint] = useState<string | null>(null);
  const [pushStatus, setPushStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [pwMsg, setPwMsg] = useState<string | null>(null);

  const loadPrefs = useCallback(async () => {
    const data = await apiFetch<NotificationPreferences>("/api/auth/preferences");
    setPrefs(data);
  }, []);

  useEffect(() => {
    if (!user) return;
    loadPrefs().catch(() => setPrefs(null));
    getStoredPushEndpoint().then(setPushEndpoint).catch(() => setPushEndpoint(null));
  }, [user, loadPrefs]);

  useEffect(() => {
    let sub: { remove: () => void } | null = null;
    try {
      sub = Notifications.addNotificationReceivedListener((notification) => {
        const data = notification.request.content.data as {
          dispatchId?: string;
          receiptToken?: string;
        };
        reportPushReceipt({
          dispatchId: data.dispatchId,
          receiptToken: data.receiptToken,
          stage: "displayed",
        });
      });
    } catch {
      // Native notifications may be unavailable until FCM is configured.
    }
    return () => {
      try {
        sub?.remove();
      } catch {
        // ignore
      }
    };
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.ice} />
      </View>
    );
  }
  if (!user) return <Redirect href="/login" />;

  const toggleLead = async (seconds: number) => {
    if (!prefs) return;
    const set = new Set(prefs.warningLeadsSeconds);
    if (set.has(seconds)) set.delete(seconds);
    else set.add(seconds);
    const warningLeadsSeconds = Array.from(set).sort((a, b) => b - a);
    try {
      const updated = await apiFetch<NotificationPreferences>("/api/auth/preferences", {
        method: "PATCH",
        body: JSON.stringify({ warningLeadsSeconds }),
      });
      setPrefs(updated);
    } catch (err) {
      setPushStatus(err instanceof Error ? err.message : "Could not save preferences");
    }
  };

  const enablePush = async () => {
    setBusy(true);
    setPushStatus(null);
    try {
      const result = await registerForPushAsync();
      if (!result.ok) {
        setPushStatus(result.error || "Failed");
      } else {
        setPushEndpoint(result.endpoint || null);
        setPushStatus("Notifications enabled on this device");
      }
    } catch (err) {
      setPushStatus(err instanceof Error ? err.message : "Push registration failed");
    } finally {
      setBusy(false);
    }
  };

  const disablePush = async () => {
    setBusy(true);
    try {
      await unregisterPush(pushEndpoint);
      setPushEndpoint(null);
      setPushStatus("Notifications disabled on this device");
    } catch (err) {
      setPushStatus(err instanceof Error ? err.message : "Unsubscribe failed");
    } finally {
      setBusy(false);
    }
  };

  const changePassword = async () => {
    setPwMsg(null);
    try {
      await apiFetch("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword("");
      setNewPassword("");
      setPwMsg("Password updated");
    } catch (err) {
      setPwMsg(err instanceof ApiError ? err.message : "Could not change password");
    }
  };

  return (
    <ScrollView contentContainerStyle={[styles.root, { paddingBottom: bottomInset + 16 }]}>
      <Text style={styles.heading}>Account</Text>
      <Text style={styles.meta}>
        {user.displayName} · @{user.username} · {user.role}
      </Text>
      <Text style={styles.metaSmall}>API: {getApiBaseUrl()}</Text>
      <Text style={styles.metaSmall}>
        EAS project: {getExpoProjectId() ? "configured" : "missing — run eas init"}
      </Text>

      <Text style={styles.heading}>Native push</Text>
      <Text style={styles.body}>
        Enable alerts so you get WARNING and LAUNCH notifications even when the app is
        backgrounded.
      </Text>
      {pushEndpoint ? <Text style={styles.status}>Registered on this install</Text> : null}
      <View style={styles.row}>
        <Pressable style={styles.primary} onPress={enablePush} disabled={busy}>
          <Text style={styles.primaryText}>{busy ? "Working…" : "Enable notifications"}</Text>
        </Pressable>
        <Pressable style={styles.secondary} onPress={disablePush} disabled={busy}>
          <Text style={styles.secondaryText}>Disable</Text>
        </Pressable>
      </View>
      {pushStatus ? <Text style={styles.status}>{pushStatus}</Text> : null}

      <Text style={styles.heading}>Warning leads</Text>
      <Text style={styles.body}>Launch and rally-start alerts are always sent.</Text>
      <View style={styles.chips}>
        {ALLOWED.map((sec) => {
          const on = prefs?.warningLeadsSeconds.includes(sec);
          return (
            <Pressable
              key={sec}
              onPress={() => toggleLead(sec)}
              style={[styles.chip, on && styles.chipOn]}
            >
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{sec}s</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.heading}>Change password</Text>
      <TextInput
        style={styles.input}
        secureTextEntry
        placeholder="Current password"
        placeholderTextColor={colors.muted}
        value={currentPassword}
        onChangeText={setCurrentPassword}
      />
      <TextInput
        style={styles.input}
        secureTextEntry
        placeholder="New password (8+)"
        placeholderTextColor={colors.muted}
        value={newPassword}
        onChangeText={setNewPassword}
      />
      <Pressable style={styles.secondary} onPress={changePassword}>
        <Text style={styles.secondaryText}>Update password</Text>
      </Pressable>
      {pwMsg ? <Text style={styles.status}>{pwMsg}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { padding: 16, paddingBottom: 40, gap: 10 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  heading: {
    color: colors.snow,
    fontSize: 18,
    fontWeight: "800",
    marginTop: 16,
  },
  meta: { color: colors.muted },
  metaSmall: { color: colors.muted, fontSize: 11, marginTop: 2 },
  body: { color: colors.muted, lineHeight: 20 },
  row: { flexDirection: "row", gap: 10, marginTop: 8 },
  primary: {
    flex: 1,
    backgroundColor: colors.ice,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  primaryText: { color: colors.bg, fontWeight: "800" },
  secondary: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: "center",
  },
  secondaryText: { color: colors.snow, fontWeight: "700" },
  status: { color: colors.ice, marginTop: 4 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipOn: { backgroundColor: colors.ice, borderColor: colors.ice },
  chipText: { color: colors.muted, fontWeight: "700" },
  chipTextOn: { color: colors.bg },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.snow,
  },
});
