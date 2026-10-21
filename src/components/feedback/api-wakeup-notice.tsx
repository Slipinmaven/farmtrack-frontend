import { Ionicons } from "@expo/vector-icons";
import { useSyncExternalStore } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText } from "@/components/ui/app-text";
import {
  isApiWakingUp,
  subscribeToApiWakeup,
} from "@/lib/api/request-status";
import { useTheme } from "@/providers/theme-provider";

export function ApiWakeupNotice() {
  const wakingUp = useSyncExternalStore(
    subscribeToApiWakeup,
    isApiWakingUp,
    isApiWakingUp,
  );
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  if (!wakingUp) return null;

  return (
    <View
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      style={[styles.position, { top: insets.top + 8 }]}
    >
      <View
        style={[
          styles.notice,
          {
            backgroundColor: theme.backgroundElement,
            borderColor: theme.border,
          },
        ]}
      >
        <Ionicons name="cloud-outline" size={18} color={theme.primary} />
        <View style={styles.copy}>
          <AppText size="small" weight="semibold">
            Connecting to FarmTrack
          </AppText>
          <AppText size="small" tone="secondary">
            The server may take up to a minute to wake.
          </AppText>
        </View>
        <ActivityIndicator size="small" color={theme.primary} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  position: {
    position: "absolute",
    left: 12,
    right: 12,
    alignItems: "center",
    zIndex: 1000,
  },
  notice: {
    width: "100%",
    maxWidth: 480,
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    elevation: 3,
    shadowColor: "#000000",
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  copy: { flex: 1, gap: 1 },
});
