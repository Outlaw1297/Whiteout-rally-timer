import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { apiFetch } from "../lib/api";
import { useAuth } from "../lib/auth";
import { formatArrivalTime, formatGather, parseMarchDuration } from "../lib/time";
import type { SerializedEvent } from "../lib/types";
import { useCountdown } from "../hooks/useCountdown";
import { useEventSocket } from "../hooks/useEventSocket";
import { useServerClock } from "../hooks/useServerClock";
import { colors } from "./theme";

export function RallyView({ eventId }: { eventId: string }) {
  const { user } = useAuth();
  const [event, setEvent] = useState<SerializedEvent | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [marchDraft, setMarchDraft] = useState("");
  const [marchSaving, setMarchSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const marchDirtyRef = useRef(false);

  const { correctedNow } = useServerClock();
  const assignment = event?.assignments.find((a) => a.userId === user?.id) ?? null;
  const launchMs = assignment?.launchTime ? new Date(assignment.launchTime).getTime() : null;
  const { display: countdown, isNow } = useCountdown(launchMs, correctedNow);

  const applyServerMarch = useCallback(
    (data: SerializedEvent) => {
      const mine = data.assignments?.find((a) => a.userId === user?.id);
      if (mine?.marchFormatted && !marchDirtyRef.current) {
        setMarchDraft(mine.marchFormatted);
      }
    },
    [user?.id]
  );

  const loadEvent = useCallback(() => {
    apiFetch<SerializedEvent>(`/api/events/${eventId}`)
      .then((data) => {
        setError(null);
        setEvent(data);
        const mine = data.assignments?.find((a) => a.userId === user?.id);
        if (mine?.status === "LAUNCHED") setConfirmed(true);
        applyServerMarch(data);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load rally"));
  }, [eventId, user?.id, applyServerMarch]);

  useEventSocket({
    eventId,
    onEventUpdate: (e) => {
      setEvent(e);
      applyServerMarch(e);
    },
  });

  useEffect(() => {
    if (user) loadEvent();
  }, [user, loadEvent]);

  useEffect(() => {
    if (event?.status !== "ACTIVE") return;
    const interval = setInterval(loadEvent, 2000);
    return () => clearInterval(interval);
  }, [event?.status, loadEvent]);

  const confirmLaunch = async () => {
    if (!assignment) return;
    try {
      await apiFetch(`/api/assignments/${assignment.id}/confirm-launch`, { method: "POST" });
      setConfirmed(true);
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : "Confirm failed");
    }
  };

  const saveMarch = async () => {
    if (!assignment || !event) return;
    if (!parseMarchDuration(marchDraft)) {
      setStatusError("Invalid march (use M:SS)");
      setStatusMsg(null);
      return;
    }
    setMarchSaving(true);
    try {
      await apiFetch(`/api/events/${event.id}/assignments/${assignment.id}`, {
        method: "PATCH",
        body: JSON.stringify({ marchDuration: marchDraft }),
      });
      marchDirtyRef.current = false;
      setStatusMsg("March time saved");
      setStatusError(null);
      loadEvent();
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : "Failed to save march");
      setStatusMsg(null);
    } finally {
      setMarchSaving(false);
    }
  };

  if (error) {
    return <Text style={styles.error}>{error}</Text>;
  }

  if (!event || !assignment || !user) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.ice} />
        <Text style={styles.muted}>Loading rally…</Text>
      </View>
    );
  }

  const waitingForGo =
    !assignment.launchTime || event.status === "READY" || event.status === "DRAFT";
  const canEditMarch = event.status === "DRAFT" || event.status === "READY";

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.badge}>
          {event.status === "ACTIVE"
            ? "● Live"
            : waitingForGo
              ? "Waiting for GO"
              : event.status}
        </Text>
        <Text style={styles.title}>{event.name}</Text>
        <Text style={styles.subtitle}>{user.displayName}</Text>
      </View>

      {(statusMsg || statusError) && (
        <Pressable
          onPress={() => {
            setStatusMsg(null);
            setStatusError(null);
          }}
          style={[styles.banner, statusError ? styles.bannerError : styles.bannerOk]}
        >
          <Text style={styles.bannerText}>{statusError || statusMsg}</Text>
        </Pressable>
      )}

      <View style={[styles.panel, isNow && !waitingForGo && styles.panelLaunch]}>
        <Text style={styles.label}>Your rally</Text>
        <Text style={styles.clock}>{formatArrivalTime(assignment.launchTime)}</Text>
        <Text style={styles.label}>
          {isNow && !waitingForGo ? "Action" : "Throw rally in"}
        </Text>
        {waitingForGo ? (
          <Text style={[styles.countdown, { color: colors.muted }]}>WAITING</Text>
        ) : isNow ? (
          <Text style={styles.launchNow}>Launch Now</Text>
        ) : (
          <Text style={styles.countdown}>{countdown}</Text>
        )}
      </View>

      <View style={styles.grid}>
        <View style={styles.cell}>
          <Text style={styles.label}>Your march</Text>
          {canEditMarch ? (
            <>
              <TextInput
                value={marchDraft}
                onChangeText={(v) => {
                  marchDirtyRef.current = true;
                  setMarchDraft(v);
                }}
                placeholder="M:SS"
                placeholderTextColor={colors.muted}
                style={styles.input}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Pressable
                onPress={saveMarch}
                disabled={marchSaving}
                style={styles.secondaryBtn}
              >
                <Text style={styles.secondaryBtnText}>
                  {marchSaving ? "Saving…" : "Save march"}
                </Text>
              </Pressable>
            </>
          ) : (
            <Text style={styles.cellValue}>{assignment.marchFormatted}</Text>
          )}
        </View>
        <View style={styles.cell}>
          <Text style={styles.label}>Rally time</Text>
          <Text style={styles.cellValue}>{formatGather(event.gatherDurationSeconds)}</Text>
        </View>
        <View style={[styles.cell, styles.cellWide]}>
          <Text style={styles.label}>Expected arrival</Text>
          <Text style={styles.cellValue}>
            {formatArrivalTime(assignment.expectedArrivalTime)}
          </Text>
        </View>
        <View style={[styles.cell, styles.cellWide]}>
          <Text style={styles.label}>Target arrival</Text>
          <Text style={[styles.cellValue, { color: colors.ice }]}>
            {formatArrivalTime(event.targetArrivalTime)}
          </Text>
        </View>
      </View>

      <View style={styles.footer}>
        {waitingForGo ? (
          <View style={styles.panel}>
            <Text style={styles.muted}>
              Launch time appears when an admin presses GO.
            </Text>
          </View>
        ) : confirmed ? (
          <View style={[styles.panel, styles.confirmed]}>
            <Text style={styles.confirmedTitle}>✓ Launched</Text>
            <Text style={styles.muted}>
              Launch: {formatArrivalTime(assignment.launchTime)}
            </Text>
          </View>
        ) : (
          <Pressable
            onPress={confirmLaunch}
            style={[styles.confirmBtn, isNow && styles.confirmBtnHot]}
          >
            <Text style={styles.confirmBtnText}>
              {isNow ? "Confirm — Rally Launched" : "Rally Launched"}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  header: { alignItems: "center", marginBottom: 16 },
  badge: {
    color: colors.ice,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  title: { color: colors.snow, fontSize: 26, fontWeight: "800", textAlign: "center" },
  subtitle: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 4,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  panel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
    marginBottom: 16,
  },
  panelLaunch: { borderColor: colors.launch },
  label: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  clock: {
    color: colors.snow,
    fontSize: 28,
    fontVariant: ["tabular-nums"],
    fontWeight: "700",
    marginVertical: 10,
  },
  countdown: {
    color: colors.ice,
    fontSize: 48,
    fontVariant: ["tabular-nums"],
    fontWeight: "800",
    marginTop: 6,
  },
  launchNow: {
    color: colors.launch,
    fontSize: 36,
    fontWeight: "900",
    textTransform: "uppercase",
    marginTop: 8,
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 16 },
  cell: {
    width: "48%",
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
  },
  cellWide: { width: "100%" },
  cellValue: {
    color: colors.snow,
    fontSize: 20,
    fontVariant: ["tabular-nums"],
    fontWeight: "700",
    marginTop: 8,
  },
  input: {
    marginTop: 8,
    width: "100%",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    color: colors.snow,
    textAlign: "center",
    fontSize: 18,
    fontVariant: ["tabular-nums"],
  },
  secondaryBtn: {
    marginTop: 8,
    backgroundColor: colors.ice,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    width: "100%",
  },
  secondaryBtnText: {
    color: colors.bg,
    fontWeight: "700",
    textAlign: "center",
    fontSize: 12,
  },
  footer: { marginTop: "auto" },
  confirmBtn: {
    backgroundColor: colors.success,
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: "center",
  },
  confirmBtnHot: { backgroundColor: colors.launch },
  confirmBtnText: { color: "#fff", fontSize: 18, fontWeight: "800" },
  confirmed: { borderColor: "rgba(52,211,153,0.4)", backgroundColor: "rgba(52,211,153,0.1)" },
  confirmedTitle: { color: colors.success, fontWeight: "800", fontSize: 18, marginBottom: 6 },
  muted: { color: colors.muted, textAlign: "center", fontSize: 14 },
  error: { color: colors.danger, textAlign: "center", marginTop: 40 },
  banner: { borderRadius: 10, padding: 10, marginBottom: 12 },
  bannerOk: { backgroundColor: "rgba(52,211,153,0.15)" },
  bannerError: { backgroundColor: "rgba(248,113,113,0.15)" },
  bannerText: { color: colors.snow, textAlign: "center" },
});
