import { ReactNode } from "react";
import { StyleSheet, View, ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "./theme";

type Edge = "top" | "bottom";

interface ScreenProps {
  children: ReactNode;
  style?: ViewStyle;
  edges?: Edge[];
  horizontal?: number;
}

/** Root screen wrapper with safe-area padding for gesture nav / home indicator. */
export function Screen({
  children,
  style,
  edges = ["bottom"],
  horizontal = 16,
}: ScreenProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.root,
        { paddingHorizontal: horizontal },
        edges.includes("top") && { paddingTop: insets.top },
        edges.includes("bottom") && {
          paddingBottom: Math.max(insets.bottom, 16),
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** Bottom inset only — use on sticky footers inside a flex screen. */
export function useBottomInset(min = 16): number {
  const insets = useSafeAreaInsets();
  return Math.max(insets.bottom, min);
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
});
