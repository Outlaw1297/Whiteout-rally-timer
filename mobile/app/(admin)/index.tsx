import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Redirect, router } from "expo-router";
import { useAuth } from "../../lib/auth";
import { apiFetch } from "../../lib/api";
import { isAdminRole } from "../../lib/roles";
import { formatGather, parseGatherDuration } from "../../lib/time";
import type { SerializedEvent } from "../../lib/types";
import { useBottomInset } from "../../components/Screen";
import { colors } from "../../components/theme";

function statusColor(status: string): string {
  switch (status) {
    case "ACTIVE":
      return colors.success;
    case "READY":
      return colors.warning;
    case "COMPLETED":
      return colors.muted;
    default:
      return colors.ice;
  }
}

export default function AdminHome() {
  const { user, loading, logout } = useAuth();
  const bottomInset = useBottomInset();
  const [events, setEvents] = useState<SerializedEvent[] | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [gather, setGather] = useState("5:00");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadEvents = useCallback(() => {
    apiFetch<{ events: SerializedEvent[] }>("/api/events")
      .then((data) => setEvents(data.events || []))
      .catch(() => setEvents([]));
  }, []);

  useEffect(() => {
    if (user && isAdminRole(user.role)) loadEvents();
  }, [user, loadEvents]);

  useEffect(() => {
    if (!user || !isAdminRole(user.role)) return;
    const t = setInterval(loadEvents, 5000);
    return () => clearInterval(t);
  }, [user, loadEvents]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.ice} />
      </View>
    );
  }

  if (!user) return <Redirect href="/login" />;
  if (!isAdminRole(user.role)) return <Redirect href="/(caller)" />;

  const createTemplate = async () => {
    setError(null);
    const gatherSeconds = parseGatherDuration(gather);
    if (!name.trim()) {
      setError("Name required");
      return;
    }
    if (gatherSeconds === null) {
      setError("Invalid rally time (M:SS)");
      return;
    }
    setCreating(true);
    try {
      const event = await apiFetch<SerializedEvent>("/api/events", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          gatherDurationSeconds: gatherSeconds,
          isTestMode: name.trim().toUpperCase() === "TEST RALLY",
        }),
      });
      setShowCreate(false);
      setName("");
      setGather("5:00");
      loadEvents();
      router.push(`/(admin)/events/${event.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create rally");
    } finally {
      setCreating(false);
    }
  };

  const startRally = async (id: string, rallyName: string) => {
    Alert.alert("Start rally", `Press GO for "${rallyName}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "GO",
        style: "default",
        onPress: async () => {
          setBusyId(id);
          try {
            await apiFetch(`/api/events/${id}/start`, { method: "POST" });
            loadEvents();
            router.push(`/(admin)/events/${id}`);
          } catch (err) {
            Alert.alert("Error", err instanceof Error ? err.message : "Start failed");
          } finally {
            setBusyId(null);
          }
        },
      },
    ]);
  };

  const resetRally = (id: string, rallyName: string) => {
    Alert.alert(
      "Reset rally",
      `Reset "${rallyName}" back to template? Launch times will be cleared.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: async () => {
            setBusyId(id);
            try {
              await apiFetch(`/api/events/${id}/reset`, { method: "POST" });
              loadEvents();
            } catch (err) {
              Alert.alert("Error", err instanceof Error ? err.message : "Reset failed");
            } finally {
              setBusyId(null);
            }
          },
        },
      ]
    );
  };

  const deleteRally = (id: string, rallyName: string, status: string) => {
    const msg =
      status === "ACTIVE"
        ? `Stop and delete live rally "${rallyName}"?`
        : `Delete template "${rallyName}"?`;
    Alert.alert("Delete rally", msg, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setBusyId(id);
          try {
            await apiFetch(`/api/events/${id}`, { method: "DELETE" });
            loadEvents();
          } catch (err) {
            Alert.alert("Error", err instanceof Error ? err.message : "Delete failed");
          } finally {
            setBusyId(null);
          }
        },
      },
    ]);
  };

  if (events === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.ice} />
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={[styles.scroll, { paddingBottom: bottomInset + 16 }]}
    >
      <View style={styles.topBar}>
        <Pressable onPress={() => router.push("/(caller)")} style={styles.linkBtn}>
          <Text style={styles.linkText}>My rally</Text>
        </Pressable>
        <Pressable onPress={() => logout()} style={styles.linkBtn}>
          <Text style={styles.linkText}>Logout</Text>
        </Pressable>
      </View>

      <Text style={styles.subtitle}>
        {user.displayName} · {user.role}
      </Text>

      <Pressable
        onPress={() => setShowCreate((v) => !v)}
        style={[styles.createToggle, showCreate && styles.createToggleAlt]}
      >
        <Text style={styles.createToggleText}>
          {showCreate ? "Cancel" : "+ New rally template"}
        </Text>
      </Pressable>

      {showCreate && (
        <View style={styles.panel}>
          <Text style={styles.label}>Template name</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Bear Trap"
            placeholderTextColor={colors.muted}
            style={styles.input}
          />
          <Text style={styles.label}>Rally time (gather)</Text>
          <TextInput
            value={gather}
            onChangeText={setGather}
            placeholder="5:00"
            placeholderTextColor={colors.muted}
            style={styles.input}
            autoCapitalize="none"
          />
          <Pressable
            onPress={() => {
              setName("TEST RALLY");
              setGather("0:10");
            }}
            style={styles.ghostBtn}
          >
            <Text style={styles.ghostBtnText}>Fill test mode (0:10)</Text>
          </Pressable>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable
            onPress={createTemplate}
            disabled={creating}
            style={styles.primaryBtn}
          >
            <Text style={styles.primaryBtnText}>
              {creating ? "Creating…" : "Create template"}
            </Text>
          </Pressable>
        </View>
      )}

      {events.length === 0 ? (
        <Text style={styles.empty}>No rally templates yet</Text>
      ) : (
        events.map((event) => {
          const canGo =
            event.status === "READY" && event.assignments.length > 0;
          const canReset =
            event.status === "ACTIVE" || event.status === "COMPLETED";
          const isBusy = busyId === event.id;

          return (
            <View key={event.id} style={styles.card}>
              <Pressable onPress={() => router.push(`/(admin)/events/${event.id}`)}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>{event.name}</Text>
                  <Text style={[styles.badge, { color: statusColor(event.status) }]}>
                    {event.status}
                  </Text>
                </View>
                <Text style={styles.cardMeta}>
                  Rally {formatGather(event.gatherDurationSeconds)} ·{" "}
                  {event.assignments.length} caller
                  {event.assignments.length !== 1 ? "s" : ""}
                </Text>
                {event.status === "READY" && (
                  <Text style={styles.readyHint}>Ready — add callers or press GO</Text>
                )}
              </Pressable>

              <View style={styles.cardActions}>
                {canGo && (
                  <Pressable
                    onPress={() => startRally(event.id, event.name)}
                    disabled={isBusy}
                    style={[styles.goBtn, isBusy && styles.btnDisabled]}
                  >
                    <Text style={styles.goBtnText}>{isBusy ? "…" : "GO"}</Text>
                  </Pressable>
                )}
                {canReset && (
                  <Pressable
                    onPress={() => resetRally(event.id, event.name)}
                    disabled={isBusy}
                    style={styles.secondaryBtn}
                  >
                    <Text style={styles.secondaryBtnText}>Reset</Text>
                  </Pressable>
                )}
                <Pressable
                  onPress={() => deleteRally(event.id, event.name, event.status)}
                  disabled={isBusy}
                  style={styles.dangerBtn}
                >
                  <Text style={styles.dangerBtnText}>Delete</Text>
                </Pressable>
              </View>
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  scroll: { padding: 16, gap: 12 },
  topBar: { flexDirection: "row", justifyContent: "flex-end", gap: 8 },
  linkBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  linkText: { color: colors.muted, fontSize: 13, fontWeight: "600" },
  subtitle: { color: colors.muted, fontSize: 13, marginBottom: 4 },
  createToggle: {
    backgroundColor: colors.ice,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  createToggleAlt: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  createToggleText: { color: colors.bg, fontWeight: "800", fontSize: 15 },
  panel: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 8,
  },
  label: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  input: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.snow,
    fontSize: 16,
  },
  ghostBtn: { alignSelf: "flex-start", paddingVertical: 4 },
  ghostBtnText: { color: colors.ice, fontSize: 13, fontWeight: "600" },
  error: { color: colors.danger, fontSize: 13 },
  primaryBtn: {
    backgroundColor: colors.success,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 4,
  },
  primaryBtnText: { color: "#fff", fontWeight: "800" },
  empty: { color: colors.muted, textAlign: "center", paddingVertical: 32 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 10,
  },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  cardTitle: { color: colors.snow, fontSize: 18, fontWeight: "800", flex: 1 },
  badge: { fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },
  cardMeta: { color: colors.muted, fontSize: 13, marginTop: 4 },
  readyHint: { color: colors.warning, fontSize: 12, fontWeight: "700", marginTop: 6 },
  cardActions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  goBtn: {
    backgroundColor: colors.launch,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 20,
    minWidth: 72,
    alignItems: "center",
  },
  goBtnText: { color: "#fff", fontWeight: "900", fontSize: 16 },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  secondaryBtnText: { color: colors.warning, fontWeight: "700" },
  dangerBtn: {
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  dangerBtnText: { color: colors.danger, fontWeight: "700" },
  btnDisabled: { opacity: 0.5 },
});
