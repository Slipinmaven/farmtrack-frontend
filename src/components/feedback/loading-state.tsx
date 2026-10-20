import { ActivityIndicator, StyleSheet, View } from "react-native";

import { AppText } from "@/components/ui/app-text";
import { useTheme } from "@/providers/theme-provider";

export function LoadingState({
  label = "Loading FarmTrack",
}: {
  label?: string;
}) {
  const { theme } = useTheme();
  return (
    <View
      accessibilityRole="progressbar"
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      <ActivityIndicator color={theme.primary} size="large" />
      <AppText tone="secondary" size="small">
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    padding: 24,
  },
});
