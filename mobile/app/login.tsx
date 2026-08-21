import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Redirect, router } from "expo-router";
import { useAuth } from "../lib/auth";
import { ApiError } from "../lib/api";
import { getApiBaseUrl } from "../lib/config";
import { colors } from "../components/theme";

export default function LoginScreen() {
  const { user, loading, login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!loading && user) {
    return <Redirect href="/(caller)" />;
  }

  const onSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await login(username.trim(), password);
      router.replace("/(caller)");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.card}>
        <Text style={styles.brand}>Whiteout Rally</Text>
        <Text style={styles.tagline}>Caller throw timer</Text>

        <TextInput
          style={styles.input}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="Username"
          placeholderTextColor={colors.muted}
          value={username}
          onChangeText={setUsername}
        />
        <TextInput
          style={styles.input}
          secureTextEntry
          placeholder="Password"
          placeholderTextColor={colors.muted}
          value={password}
          onChangeText={setPassword}
          onSubmitEditing={onSubmit}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          style={[styles.btn, submitting && styles.btnDisabled]}
          onPress={onSubmit}
          disabled={submitting || !username || !password}
        >
          {submitting ? (
            <ActivityIndicator color={colors.bg} />
          ) : (
            <Text style={styles.btnText}>Sign in</Text>
          )}
        </Pressable>

        <Text style={styles.hint}>API: {getApiBaseUrl()}</Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
    justifyContent: "center",
    padding: 24,
  },
  card: { gap: 12 },
  brand: {
    color: colors.snow,
    fontSize: 34,
    fontWeight: "900",
    letterSpacing: -0.5,
    textAlign: "center",
  },
  tagline: {
    color: colors.muted,
    textAlign: "center",
    marginBottom: 20,
    fontSize: 14,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    color: colors.snow,
    fontSize: 16,
  },
  btn: {
    marginTop: 8,
    backgroundColor: colors.ice,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: colors.bg, fontWeight: "800", fontSize: 16 },
  error: { color: colors.danger, textAlign: "center" },
  hint: { color: colors.muted, fontSize: 11, textAlign: "center", marginTop: 16 },
});
