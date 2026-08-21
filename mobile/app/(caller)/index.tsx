import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Redirect, router } from "expo-router";
import { useAuth } from "../../lib/auth";
import { apiFetch } from "../../lib/api";
import { pickPrimaryCallerEvent } from "../../lib/caller-events";
import type { SerializedEvent } from "../../lib/types";
import { useServerClock } from "../../hooks/useServerClock";
import { RallyView } from "../../components/RallyView";
import { colors } from "../../components/theme";

export default function CallerHome() {
  const { user, loading, logout } = useAuth();
  const [events, setEvents] = useState<SerializedEvent[] | null>(null);
  const { correctedNow } = useServerClock();

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const load = () => {
      apiFetch<{ events: SerializedEvent[] }>("/api/events")
        .then((data) => {
          if (!cancelled) setEvents(data.events || []);
        })
        .catch(() => {
          if (!cancelled) setEvents([]);
        });
    };
    load();
    const t = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [user]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.ice} />
      </View>
    );
  }

  if (!user) return <Redirect href="/login" />;

  if (events === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.ice} />
      </View>
    );
  }

  const primary = pickPrimaryCallerEvent(events, user.id, correctedNow());

  return (
    <View style={styles.root}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.push("/(caller)/settings")} style={styles.linkBtn}>
          <Text style={styles.linkText}>Settings</Text>
        </Pressable>
        <Pressable onPress={() => logout()} style={styles.linkBtn}>
          <Text style={styles.linkText}>Logout</Text>
        </Pressable>
      </View>

      {primary ? (
        <RallyView eventId={primary.id} />
      ) : (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No rally assigned yet</Text>
          <Text style={styles.emptyBody}>
            When an admin links you to a template, your throw countdown will show here.
          </Text>
          <Pressable
            onPress={() => router.push("/(caller)/settings")}
            style={styles.secondary}
          >
            <Text style={styles.secondaryText}>Notification settings</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 16, paddingBottom: 24 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  topBar: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    paddingVertical: 8,
  },
  linkBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  linkText: { color: colors.muted, fontSize: 13, fontWeight: "600" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  emptyTitle: { color: colors.snow, fontWeight: "700", fontSize: 18, marginBottom: 8 },
  emptyBody: { color: colors.muted, textAlign: "center", marginBottom: 20, lineHeight: 20 },
  secondary: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  secondaryText: { color: colors.snow, fontWeight: "600" },
});
