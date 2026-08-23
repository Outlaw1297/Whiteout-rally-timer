import { useCallback, useEffect, useMemo, useState } from "react";
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
import { Redirect, useLocalSearchParams } from "expo-router";
import { useAuth } from "../../../lib/auth";
import { apiFetch } from "../../../lib/api";
import { isAdminRole } from "../../../lib/roles";
import {
  formatArrivalTime,
  formatGather,
  parseGatherDuration,
  parseMarchDuration,
} from "../../../lib/time";
import type { SerializedEvent } from "../../../lib/types";
import { useEventSocket } from "../../../hooks/useEventSocket";
import { useBottomInset } from "../../../components/Screen";
import { colors } from "../../../components/theme";

interface AdminUser {
  id: string;
  username: string;
  displayName: string;
  role: string;
  active: boolean;
  online?: boolean;
}

export default function AdminEventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, loading } = useAuth();
  const bottomInset = useBottomInset();
  const [event, setEvent] = useState<SerializedEvent | null>(null);
  const [callers, setCallers] = useState<AdminUser[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [nameDraft, setNameDraft] = useState("");
  const [gatherDraft, setGatherDraft] = useState("");
  const [addName, setAddName] = useState("");
  const [addMarch, setAddMarch] = useState("8:00");
  const [linkUserId, setLinkUserId] = useState<string | null>(null);

  const loadEvent = useCallback(() => {
    if (!id) return;
    apiFetch<SerializedEvent>(`/api/events/${id}`)
      .then((data) => {
        setLoadError(null);
        setEvent(data);
        setNameDraft(data.name);
        setGatherDraft(formatGather(data.gatherDurationSeconds));
      })
      .catch((err) =>
        setLoadError(err instanceof Error ? err.message : "Could not load rally")
      );
  }, [id]);

  const loadCallers = useCallback(() => {
    apiFetch<{ users: AdminUser[] }>("/api/admin/users")
      .then((data) => {
        setCallers(
          (data.users || []).filter(
            (u) =>
              u.active &&
              (u.role === "CALLER" || u.role === "ADMIN" || u.role === "DEVELOPER")
          )
        );
      })
      .catch(() => setCallers([]));
  }, []);

  useEventSocket({
    eventId: id || "",
    onEventUpdate: (e) => setEvent((prev) => (prev ? { ...prev, ...e } : e)),
  });

  useEffect(() => {
    if (user && isAdminRole(user.role)) {
      loadEvent();
      loadCallers();
    }
  }, [user, loadEvent, loadCallers]);

  useEffect(() => {
    if (!event) return;
    if (event.status === "ACTIVE") {
      const t = setInterval(loadEvent, 2000);
      return () => clearInterval(t);
    }
    if (event.status === "DRAFT" || event.status === "READY") {
      const t = setInterval(loadEvent, 3000);
      return () => clearInterval(t);
    }
  }, [event?.status, loadEvent]);

  const linkedUserIds = useMemo(
    () => new Set((event?.assignments || []).map((a) => a.userId).filter(Boolean)),
    [event?.assignments]
  );

  const availableCallers = useMemo(
    () => callers.filter((c) => !linkedUserIds.has(c.id)),
    [callers, linkedUserIds]
  );

  const canEditTemplate =
    event?.status === "DRAFT" || event?.status === "READY";
  const canGo = event?.status === "READY" && (event.assignments.length ?? 0) > 0;
  const canReset = event?.status === "ACTIVE" || event?.status === "COMPLETED";

  const flash = (msg: string) => {
    setStatusMsg(msg);
    setTimeout(() => setStatusMsg((cur) => (cur === msg ? null : cur)), 3500);
  };

  const saveTiming = async () => {
    if (!event || !canEditTemplate) return;
    const gatherSeconds = parseGatherDuration(gatherDraft);
    if (!nameDraft.trim()) {
      Alert.alert("Error", "Name required");
      return;
    }
    if (gatherSeconds === null) {
      Alert.alert("Error", "Invalid rally time (M:SS)");
      return;
    }
    setBusy(true);
    try {
      const updated = await apiFetch<SerializedEvent>(`/api/events/${event.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: nameDraft.trim(),
          gatherDurationSeconds: gatherSeconds,
        }),
      });
      setEvent(updated);
      flash("Template saved");
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const addCaller = async () => {
    if (!event || !canEditTemplate) return;
    const marchSeconds = parseMarchDuration(addMarch);
    if (!marchSeconds) {
      Alert.alert("Error", "Invalid march (M:SS)");
      return;
    }
    const linked = linkUserId ? callers.find((c) => c.id === linkUserId) : null;
    const callerName = addName.trim() || linked?.displayName;
    if (!callerName && !linkUserId) {
      Alert.alert("Error", "Enter a name or link an account");
      return;
    }
    setBusy(true);
    try {
      const updated = await apiFetch<SerializedEvent>(
        `/api/events/${event.id}/assignments`,
        {
          method: "POST",
          body: JSON.stringify({
            callerName,
            userId: linkUserId || undefined,
            marchDuration: addMarch,
          }),
        }
      );
      setEvent(updated);
      setAddName("");
      setAddMarch("8:00");
      setLinkUserId(null);
      flash("Caller added");
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Add failed");
    } finally {
      setBusy(false);
    }
  };

  const removeCaller = (assignmentId: string, displayName: string) => {
    if (!event || !canEditTemplate) return;
    Alert.alert("Remove caller", `Remove ${displayName}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          setBusy(true);
          try {
            const updated = await apiFetch<SerializedEvent>(
              `/api/events/${event.id}/assignments/${assignmentId}`,
              { method: "DELETE" }
            );
            setEvent(updated);
            flash("Caller removed");
          } catch (err) {
            Alert.alert("Error", err instanceof Error ? err.message : "Remove failed");
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  const startRally = () => {
    if (!event || !canGo) return;
    Alert.alert("Start rally", `Press GO for "${event.name}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "GO",
        onPress: async () => {
          setBusy(true);
          try {
            const data = await apiFetch<{ event: SerializedEvent }>(
              `/api/events/${event.id}/start`,
              { method: "POST" }
            );
            setEvent(data.event);
            flash("Rally is LIVE");
          } catch (err) {
            Alert.alert("Error", err instanceof Error ? err.message : "Start failed");
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  const resetRally = () => {
    if (!event || !canReset) return;
    Alert.alert("Reset rally", "Clear launch times and reset to template?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Reset",
        style: "destructive",
        onPress: async () => {
          setBusy(true);
          try {
            const data = await apiFetch<{ event: SerializedEvent }>(
              `/api/events/${event.id}/reset`,
              { method: "POST" }
            );
            setEvent(data.event);
            flash("Rally reset");
          } catch (err) {
            Alert.alert("Error", err instanceof Error ? err.message : "Reset failed");
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.ice} />
      </View>
    );
  }

  if (!user) return <Redirect href="/login" />;
  if (!isAdminRole(user.role)) return <Redirect href="/(caller)" />;
  if (!id) return <Text style={styles.error}>Missing rally id</Text>;

  if (loadError) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{loadError}</Text>
      </View>
    );
  }

  if (!event) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.ice} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: bottomInset + 100 }]}
      >
        <Text style={[styles.statusBadge, event.status === "ACTIVE" && styles.liveBadge]}>
          {event.status === "ACTIVE" ? "● LIVE" : event.status}
        </Text>

        {statusMsg ? <Text style={styles.flash}>{statusMsg}</Text> : null}

        {canEditTemplate ? (
          <View style={styles.panel}>
            <Text style={styles.label}>Template name</Text>
            <TextInput
              value={nameDraft}
              onChangeText={setNameDraft}
              style={styles.input}
              placeholderTextColor={colors.muted}
            />
            <Text style={styles.label}>Rally time (gather)</Text>
            <TextInput
              value={gatherDraft}
              onChangeText={setGatherDraft}
              style={styles.input}
              placeholder="5:00"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
            />
            <Pressable
              onPress={saveTiming}
              disabled={busy}
              style={[styles.saveBtn, busy && styles.btnDisabled]}
            >
              <Text style={styles.saveBtnText}>Save template</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.panel}>
            <Text style={styles.title}>{event.name}</Text>
            <Text style={styles.meta}>
              Rally {formatGather(event.gatherDurationSeconds)}
            </Text>
            {event.targetArrivalTime && (
              <Text style={styles.meta}>
                Target arrival {formatArrivalTime(event.targetArrivalTime)}
              </Text>
            )}
          </View>
        )}

        <Text style={styles.section}>Callers ({event.assignments.length})</Text>
        {event.assignments.length === 0 ? (
          <Text style={styles.muted}>Add at least one caller before GO.</Text>
        ) : (
          event.assignments.map((a) => (
            <View key={a.id} style={styles.callerRow}>
              <View style={styles.callerInfo}>
                <Text style={styles.callerName}>{a.displayName}</Text>
                <Text style={styles.callerMeta}>
                  March {a.marchFormatted}
                  {a.launchTime ? ` · Launch ${formatArrivalTime(a.launchTime)}` : ""}
                  {a.status ? ` · ${a.status}` : ""}
                </Text>
              </View>
              {canEditTemplate && (
                <Pressable
                  onPress={() => removeCaller(a.id, a.displayName)}
                  disabled={busy}
                  style={styles.removeBtn}
                >
                  <Text style={styles.removeBtnText}>Remove</Text>
                </Pressable>
              )}
            </View>
          ))
        )}

        {canEditTemplate && (
          <View style={styles.panel}>
            <Text style={styles.section}>Add caller</Text>
            <Text style={styles.label}>Display name (optional if linked)</Text>
            <TextInput
              value={addName}
              onChangeText={setAddName}
              style={styles.input}
              placeholder="Alice"
              placeholderTextColor={colors.muted}
            />
            <Text style={styles.label}>March (M:SS)</Text>
            <TextInput
              value={addMarch}
              onChangeText={setAddMarch}
              style={styles.input}
              placeholder="8:00"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
            />
            <Text style={styles.label}>Link account (optional)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll}>
              <Pressable
                onPress={() => setLinkUserId(null)}
                style={[styles.chip, !linkUserId && styles.chipOn]}
              >
                <Text style={[styles.chipText, !linkUserId && styles.chipTextOn]}>None</Text>
              </Pressable>
              {availableCallers.map((c) => (
                <Pressable
                  key={c.id}
                  onPress={() => {
                    setLinkUserId(c.id);
                    if (!addName.trim()) setAddName(c.displayName);
                  }}
                  style={[styles.chip, linkUserId === c.id && styles.chipOn]}
                >
                  <Text style={[styles.chipText, linkUserId === c.id && styles.chipTextOn]}>
                    {c.displayName}
                    {c.online ? " · online" : ""}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable
              onPress={addCaller}
              disabled={busy}
              style={[styles.saveBtn, busy && styles.btnDisabled]}
            >
              <Text style={styles.saveBtnText}>Add caller</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: bottomInset + 8 }]}>
        {canGo && (
          <Pressable
            onPress={startRally}
            disabled={busy}
            style={[styles.goBtn, busy && styles.btnDisabled]}
          >
            <Text style={styles.goBtnText}>GO — Start rally</Text>
          </Pressable>
        )}
        {canReset && (
          <Pressable
            onPress={resetRally}
            disabled={busy}
            style={[styles.resetBtn, busy && styles.btnDisabled]}
          >
            <Text style={styles.resetBtnText}>Reset to template</Text>
          </Pressable>
        )}
        {event.status === "ACTIVE" && (
          <Text style={styles.footerHint}>
            Live — notifications are scheduled for each caller.
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  scroll: { padding: 16, gap: 12 },
  statusBadge: {
    alignSelf: "center",
    color: colors.ice,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  liveBadge: { color: colors.success },
  flash: { color: colors.success, textAlign: "center", fontWeight: "600" },
  panel: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 8,
  },
  title: { color: colors.snow, fontSize: 22, fontWeight: "800" },
  meta: { color: colors.muted, fontSize: 14 },
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
  saveBtn: {
    backgroundColor: colors.ice,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 4,
  },
  saveBtnText: { color: colors.bg, fontWeight: "800" },
  section: { color: colors.snow, fontSize: 16, fontWeight: "800", marginTop: 4 },
  muted: { color: colors.muted, fontSize: 14 },
  callerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
  },
  callerInfo: { flex: 1 },
  callerName: { color: colors.snow, fontWeight: "700", fontSize: 16 },
  callerMeta: { color: colors.muted, fontSize: 12, marginTop: 4 },
  removeBtn: {
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  removeBtnText: { color: colors.danger, fontWeight: "700", fontSize: 12 },
  chipsScroll: { flexGrow: 0, marginVertical: 4 },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
  },
  chipOn: { backgroundColor: colors.ice, borderColor: colors.ice },
  chipText: { color: colors.muted, fontWeight: "600", fontSize: 13 },
  chipTextOn: { color: colors.bg },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 8,
    backgroundColor: colors.bg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 8,
  },
  goBtn: {
    backgroundColor: colors.launch,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  goBtnText: { color: "#fff", fontWeight: "900", fontSize: 18 },
  resetBtn: {
    borderWidth: 1,
    borderColor: colors.warning,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  resetBtnText: { color: colors.warning, fontWeight: "800", fontSize: 16 },
  footerHint: { color: colors.muted, textAlign: "center", fontSize: 12, marginBottom: 4 },
  error: { color: colors.danger, textAlign: "center", padding: 24 },
  btnDisabled: { opacity: 0.5 },
});
