import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, View } from "react-native";

import { AppText } from "@/components/ui/app-text";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/providers/theme-provider";

export function AuthRecoveryState({
  error,
  errorCode,
  onRetry,
}: {
  error: string | null;
  errorCode: string | null;
  onRetry: () => void;
}) {
  const { theme } = useTheme();
  const cannotConnect =
    errorCode === "NETWORK_ERROR" ||
    errorCode === "CLIENT_ERROR" ||
    errorCode === "SERVER_WAKE_TIMEOUT";
  const connectionMessage =
    errorCode === "SERVER_WAKE_TIMEOUT"
      ? "The FarmTrack server took too long to wake. Try again shortly; your saved sign-in is still on this device."
      : "Check your internet connection, then try again. Your saved sign-in is still on this device.";

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <View
        style={[styles.icon, { backgroundColor: theme.backgroundSelected }]}
      >
        <Ionicons
          name={cannotConnect ? "cloud-offline-outline" : "shield-outline"}
          size={27}
          color={theme.primary}
        />
      </View>
      <AppText size="heading" weight="semibold" style={styles.title}>
        {cannotConnect
          ? "Can’t connect right now"
          : "Can’t verify your sign-in"}
      </AppText>
      <AppText tone="secondary" style={styles.message}>
        {cannotConnect
          ? connectionMessage
          : (error ??
            "FarmTrack couldn’t verify your saved sign-in. Try again shortly.")}
      </AppText>
      <Button label="Try again" onPress={onRetry} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    gap: 14,
  },
  icon: {
    width: 54,
    height: 54,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 27,
  },
  title: { textAlign: "center" },
  message: { maxWidth: 420, textAlign: "center", marginBottom: 4 },
});
