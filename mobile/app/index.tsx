import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { Redirect } from "expo-router";
import { useAuth } from "../lib/auth";
import { colors } from "../components/theme";

export default function Index() {
  const { user, loading } = useAuth();

  useEffect(() => {}, []);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.ice} size="large" />
      </View>
    );
  }

  if (!user) return <Redirect href="/login" />;
  return <Redirect href="/(caller)" />;
}
